import type { ICreatorRepository, IVideoRepository } from '@domain/repositories'
import type {
  IVideoDownloader,
  IDownloadQueue,
  IPathResolver,
  IFileSystemReader,
  IFileSystemWriter,
  INotifier,
  IIdGenerator,
  RootPathRef
} from '@domain/ports'
import type { DownloadRequest, DownloadProgress, VideoInfo } from '@domain/types'
import { slugify } from '@domain/types'
import { redactError } from '@domain/types/redact'
import { classifyDownloadError } from '@domain/types/download-error'
import type { Video, Creator } from '@domain/entities'
import type { IDownloadVideo, DownloadVideoResult } from './IDownloadVideo'
import type { IFetchVideoInfo } from './IFetchVideoInfo'

/**
 * Orchestrates a video download end-to-end:
 *
 * 1. Fetches video info (pre-flight) to get the canonical video ID
 * 2. Ensures the creator and output directory exist
 * 3. Enqueues the download task into the concurrency-limited queue
 * 4. Relays progress events to the renderer via INotifier
 * 5. Upserts the Video entity into the DB on completion
 * 6. Notifies 'db-updated' so the UI refreshes
 *
 * Returns immediately with a downloadId for tracking/cancellation.
 */
export class DownloadVideo implements IDownloadVideo {
  constructor(
    private downloader: IVideoDownloader,
    private fetchInfo: IFetchVideoInfo,
    private downloadQueue: IDownloadQueue,
    private creatorRepo: ICreatorRepository,
    private videoRepo: IVideoRepository,
    private pathResolver: IPathResolver,
    private fsReader: IFileSystemReader,
    private fsWriter: IFileSystemWriter,
    private notifier: INotifier,
    private idGenerator: IIdGenerator,
    private rootPath: RootPathRef
  ) {}

  async execute(request: DownloadRequest): Promise<DownloadVideoResult> {
    const { url, creatorName } = request

    if (!url || url.trim().length === 0) {
      throw new Error('URL is required')
    }
    if (!creatorName || creatorName.trim().length === 0) {
      throw new Error('Creator name is required')
    }

    const downloadId = this.idGenerator.generate()

    // Notify UI that download is queued
    this.notifier.notify('download-progress', {
      downloadId,
      url,
      percent: 0,
      speed: null,
      eta: null,
      status: 'queued',
      creatorName: creatorName.trim()
    })

    // Enqueue — the task runs when a concurrency slot opens. `performDownload`
    // catches its own errors and emits a terminal `error` event, so the
    // promise normally resolves. The .catch here is a guarantee for the
    // residual paths where no terminal event would otherwise reach the UI:
    //   - the queue rejects without ever invoking the task (e.g. shutdown
    //     drains pending tasks before they run)
    //   - the inner catch in `performDownload` itself throws (e.g. notifier
    //     fails to deliver the original `error` event)
    // Without this, the UI is stuck in `queued` forever.
    const trimmedCreator = creatorName.trim()
    this.downloadQueue
      .enqueue(() => this.performDownload(downloadId, url, trimmedCreator))
      .catch((err) => {
        this.notifier.notify('download-progress', {
          downloadId,
          url,
          percent: 0,
          speed: null,
          eta: null,
          status: 'error',
          creatorName: trimmedCreator,
          retriable: classifyDownloadError(err) === 'retriable'
        })
        console.error(
          `[klip] Download queue error (${downloadId}):`,
          redactError(err, this.rootPath.value)
        )
      })

    return { downloadId }
  }

  cancel(downloadId: string): void {
    this.downloader.cancel(downloadId)
  }

  // ── Private ──

  private async performDownload(
    downloadId: string,
    url: string,
    creatorName: string
  ): Promise<void> {
    try {
      // 1. Pre-flight: fetch video info to get canonical ID
      const info = await this.fetchInfo.execute(url)
      const videoId = info.videoId

      // Defense-in-depth: yt-dlp produces canonical platform IDs (YouTube is
      // 11-char alphanumeric; other extractors fall in the same shape), but a
      // tampered binary or a future ID-format change must not let traversal
      // characters reach the `-o` template (`<outputDir>/${videoId}.%(ext)s`)
      // or the DB primary key.
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(videoId)) {
        throw new Error(`Invalid videoId from yt-dlp: ${JSON.stringify(videoId)}`)
      }

      // 1.5 Pre-flight dedupe: if the videoId is already in the library AND
      //     the local file exists, skip the entire download. Recovery paths
      //     (status='missing' / 'deleted', or file gone from disk) fall
      //     through to a normal download so the row is repaired in place.
      const existing = this.videoRepo.findByYoutubeVideoId(videoId)
      if (existing && existing.status === 'active' && this.fsReader.fileExists(existing.filePath)) {
        this.notifier.notify('download-progress', {
          downloadId,
          url,
          percent: 100,
          speed: null,
          eta: null,
          status: 'duplicate',
          creatorName,
          existingVideoId: existing.id,
          title: existing.title
        })
        return
      }

      // 2. Slugify creator name for disk/DB identity
      const folderName = slugify(creatorName)

      // 3. Ensure creator exists in DB
      await this.ensureCreator(folderName, creatorName, info, url)

      // 4. Prepare output directory
      const outputDir = this.pathResolver.join(
        this.rootPath.value,
        folderName,
        'downloads',
        videoId
      )
      this.fsWriter.ensureDirectory(outputDir)

      // 5. Download with progress relay (throttled at ~5 events/sec to keep
      // IPC traffic predictable across N concurrent downloads). Terminal
      // states (queued/processing/complete/error/cancelled) bypass the
      // throttle so the UI flips state immediately.
      const TERMINAL: DownloadProgress['status'][] = [
        'queued',
        'processing',
        'complete',
        'error',
        'cancelled'
      ]
      let lastEmitMs = 0
      const onProgress = (progress: DownloadProgress): void => {
        const now = Date.now()
        if (TERMINAL.includes(progress.status) || now - lastEmitMs >= 200) {
          lastEmitMs = now
          // Inject creatorName so the renderer always has it for retry,
          // even on driver-emitted events that don't know the creator.
          this.notifier.notify('download-progress', { ...progress, creatorName })
        }
      }

      const result = await this.downloader.download(
        { url, outputDir, videoId, downloadId },
        onProgress
      )

      // 6. Upsert Video entity
      const now = new Date().toISOString()
      const video: Video = {
        id: videoId,
        creatorId: folderName,
        title: result.title || info.title || videoId,
        url,
        duration: result.duration ?? info.duration ?? null,
        resolution: null,
        fileSize: null,
        filePath: result.filePath,
        thumbnailPath: result.thumbnailPath,
        downloadDate: now,
        probeStatus: 'pending',
        viewCount: result.viewCount ?? info.viewCount ?? null,
        likeCount: null,
        dislikeCount: null,
        commentCount: null,
        category: null,
        tags: [],
        uploadDate: null,
        description: info.description ?? null,
        isShort: false,
        transcriptPath: null,
        transcriptText: null,
        detailFetchedAt: null,
        status: 'active',
        deletedAt: null,
        createdAt: now,
        updatedAt: now
      }
      this.videoRepo.upsert(video)

      // 7. Notify UI to refresh — both creators (a new creator may have been
      //    auto-created in step 2) and videos.
      this.notifier.notify('db-updated', { scope: ['creators', 'videos'] })
    } catch (error) {
      // If it's a cancellation, the progress event was already sent by the driver
      if (error instanceof Error && error.message === 'Download cancelled') {
        return
      }

      // Notify error with retriable classification so the UI can decide
      // whether to show a Retry button.
      this.notifier.notify('download-progress', {
        downloadId,
        url,
        percent: 0,
        speed: null,
        eta: null,
        status: 'error',
        creatorName,
        retriable: classifyDownloadError(error) === 'retriable'
      })

      console.error(
        `[klip] Download failed (${downloadId}):`,
        redactError(error, this.rootPath.value)
      )
    }
  }

  private async ensureCreator(
    folderName: string,
    displayName: string,
    info: VideoInfo,
    videoUrl: string
  ): Promise<void> {
    // Look up by folderName — the on-disk identifier we'll use for the
    // download's output folder. The previous `findById(folderName)` was
    // wrong in general: RegisterCreator assigns `id = idGenerator.generate()`
    // (UUID) and `folderName` is a separate field. They only coincide
    // for creators auto-created by this very method, so the old lookup
    // silently passed for fresh installs but exploded the moment a
    // registered-then-downloaded workflow was exercised (the new INSERT
    // below would trip the partial UNIQUE index on `youtube_channel_id`).
    //
    // Edge case not handled here: user types a different display name
    // for an already-registered channel. findByFolderName misses, this
    // method falls through to INSERT, and the UNIQUE on
    // `youtube_channel_id` still fires. The proper fix (redirect the
    // download to the existing creator's folder and id) requires
    // threading the resolved Creator back to the caller — out of scope
    // for the immediate crash fix.
    const existing = this.creatorRepo.findByFolderName(folderName)

    // The per-video yt-dlp JSON doesn't carry the channel thumbnail — only
    // the dedicated channel call (`--flat-playlist --dump-single-json
    // --playlist-items 1`) does. So when we need an avatar, we make an
    // extra yt-dlp invocation. We only do it on paths that actually need
    // one (brand-new creator, or existing creator missing avatarUrl that
    // we still have a fetch target for) to avoid paying the cost on
    // every download of an already-complete creator.
    const needsAvatarFetch =
      !existing || (existing.avatarUrl === null && existing.status !== 'deleted')

    let fetchedAvatarUrl: string | null = null
    if (needsAvatarFetch) {
      fetchedAvatarUrl = await this.fetchChannelAvatar(info, videoUrl, folderName)
    }

    if (!existing) {
      const now = new Date().toISOString()
      const creator: Creator = {
        id: folderName,
        folderName,
        name: displayName,
        profileImagePath: null,
        youtubeChannelId: info.channelId ?? null,
        youtubeChannelUrl: info.channelUrl ?? null,
        subscriberCount: info.subscriberCount ?? null,
        avatarUrl: fetchedAvatarUrl,
        notes: null,
        tags: [],
        status: 'active',
        deletedAt: null,
        createdAt: now,
        updatedAt: now
      }
      this.creatorRepo.upsert(creator)
      // Best-effort folder creation, mirroring RegisterCreator: a new creator
      // auto-discovered through a download should have its top-level folder
      // on disk too. The downstream `ensureDirectory(outputDir)` would
      // create the tree anyway, but this keeps reconciliation symmetric for
      // creators that fail mid-download (they'd otherwise reappear without
      // any disk presence).
      try {
        const dir = this.pathResolver.join(this.rootPath.value, folderName)
        this.fsWriter.ensureDirectory(dir)
      } catch (err) {
        console.warn(
          `[DownloadVideo.ensureCreator] Folder creation failed for "${folderName}":`,
          err instanceof Error ? err.message : err
        )
      }
      return
    }

    // For an existing creator we may need to: (a) recover from `missing`,
    // (b) backfill YouTube metadata, (c) backfill avatarUrl, or any
    // combination. A creator that disappeared and is now reappearing via
    // a download should also pick up any newly-available metadata in the
    // same upsert.
    const needsRecovery = existing.status === 'missing'
    const needsBackfill =
      (!existing.youtubeChannelId && !!info.channelId) ||
      (!existing.youtubeChannelUrl && !!info.channelUrl) ||
      (existing.subscriberCount === null && info.subscriberCount != null) ||
      (existing.avatarUrl === null && fetchedAvatarUrl !== null)

    if (!needsRecovery && !needsBackfill) return

    this.creatorRepo.upsert({
      ...existing,
      status: needsRecovery ? 'active' : existing.status,
      deletedAt: needsRecovery ? null : existing.deletedAt,
      youtubeChannelId: existing.youtubeChannelId ?? info.channelId ?? null,
      youtubeChannelUrl: existing.youtubeChannelUrl ?? info.channelUrl ?? null,
      subscriberCount: existing.subscriberCount ?? info.subscriberCount ?? null,
      avatarUrl: existing.avatarUrl ?? fetchedAvatarUrl,
      updatedAt: new Date().toISOString()
    })
  }

  /**
   * Fetch the channel-level avatar URL via yt-dlp. Returns null on
   * failure — avatars are non-critical metadata and must never block a
   * download. Prefers the canonical `channelUrl` from the per-video
   * JSON when available; falls back to the video URL itself, which
   * yt-dlp's channel resolver still accepts (it walks up to the channel
   * automatically).
   */
  private async fetchChannelAvatar(
    info: VideoInfo,
    videoUrl: string,
    folderName: string
  ): Promise<string | null> {
    try {
      const channelInfo = await this.downloader.fetchChannelInfo(info.channelUrl ?? videoUrl)
      return channelInfo.avatarUrl ?? null
    } catch (err) {
      console.warn(
        `[DownloadVideo.ensureCreator] Avatar fetch failed for "${folderName}":`,
        err instanceof Error ? err.message : err
      )
      return null
    }
  }
}
