import type {
  ICreatorRepository,
  IVideoRepository,
  IDownloadHistoryRepository
} from '@domain/repositories'
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
    private rootPath: RootPathRef,
    private downloadHistoryRepo: IDownloadHistoryRepository
  ) {}

  /**
   * Convenience for appending one history row. Swallows DB errors and logs —
   * the history ledger is informational; an error writing to it must NEVER
   * derail the actual download flow that just succeeded (or just failed).
   */
  private appendHistory(entry: {
    youtubeUrl: string
    videoId: string | null
    videoTitle: string | null
    thumbnailUrl: string | null
    creatorFolderName: string | null
    status: 'success' | 'error'
    errorMessage: string | null
    errorRetryable: boolean
  }): void {
    try {
      this.downloadHistoryRepo.append({
        id: this.idGenerator.generate(),
        finishedAt: new Date().toISOString(),
        ...entry
      })
      this.notifier.notify('db-updated', { scope: ['downloadHistory'] })
    } catch (err) {
      console.warn(
        '[DownloadVideo] failed to append download_history row:',
        err instanceof Error ? err.message : err
      )
    }
  }

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
      // 1. Pre-flight: fetch video info to get canonical ID. yt-dlp's cold
      //    start + network round-trip costs ~3-5s here. Emit `fetching-info`
      //    so the UI doesn't sit on `queued` opaquely — users perceive the
      //    delay as a hang otherwise. This is unavoidable critical path:
      //    we need `videoId` for both the output filename template and the
      //    duplicate check below.
      this.notifier.notify('download-progress', {
        downloadId,
        url,
        percent: 0,
        speed: null,
        eta: null,
        status: 'fetching-info',
        creatorName
      })
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
        // Surface the duplicate detection in history so users see that the
        // attempt was acknowledged — but mark it non-retryable so the Retry
        // button stays disabled (clicking it would just produce another
        // duplicate row). Resolve the folder slug from the creator id (the
        // history ledger stores folder names, not the UUID creatorId).
        const dupCreator = this.creatorRepo.findById(existing.creatorId)
        this.appendHistory({
          youtubeUrl: url,
          videoId: existing.id,
          videoTitle: existing.title,
          thumbnailUrl: existing.thumbnailPath,
          creatorFolderName: dupCreator?.folderName ?? null,
          status: 'error',
          errorMessage: 'Already in your library.',
          errorRetryable: false
        })
        return
      }

      // 2. Slugify creator name for disk/DB identity
      const folderName = slugify(creatorName)

      // 3. Ensure creator exists in DB. Returns the resolved Creator so the
      //    video FK below references creators.id (a UUID), not the folder slug.
      const creator = await this.ensureCreator(folderName, creatorName, info, url)

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
        creatorId: creator.id,
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

      // 8. Append a `'success'` row to download_history so the Downloads page
      //    can show it under "Finished downloads" with an "Open video" CTA.
      this.appendHistory({
        youtubeUrl: url,
        videoId: video.id,
        videoTitle: video.title,
        thumbnailUrl: video.thumbnailPath,
        // The history ledger keys retries by folder name (RetryDownload calls
        // findByFolderName on this), so store the slug, not the UUID creatorId.
        creatorFolderName: folderName,
        status: 'success',
        errorMessage: null,
        errorRetryable: false
      })
    } catch (error) {
      // If it's a cancellation, the progress event was already sent by the driver
      if (error instanceof Error && error.message === 'Download cancelled') {
        // Still record the cancellation in history — the user wants to know
        // they cancelled (vs. "did the download just disappear?"). Mark
        // non-retryable so the row doesn't grow a meaningless Retry button.
        this.appendHistory({
          youtubeUrl: url,
          videoId: null,
          videoTitle: null,
          thumbnailUrl: null,
          creatorFolderName: slugify(creatorName),
          status: 'error',
          errorMessage: 'Download cancelled.',
          errorRetryable: false
        })
        return
      }

      // Notify error with retriable classification so the UI can decide
      // whether to show a Retry button.
      const retriable = classifyDownloadError(error) === 'retriable'
      this.notifier.notify('download-progress', {
        downloadId,
        url,
        percent: 0,
        speed: null,
        eta: null,
        status: 'error',
        creatorName,
        retriable
      })

      console.error(
        `[klip] Download failed (${downloadId}):`,
        redactError(error, this.rootPath.value)
      )

      // Persist the failure so the Downloads page can surface a Retry button
      // for transient errors and a permanent record for everything else. The
      // raw error message is kept verbatim — users can self-diagnose
      // "missing yt-dlp" vs "HTTP 429" without opening the log file.
      this.appendHistory({
        youtubeUrl: url,
        videoId: null,
        videoTitle: null,
        thumbnailUrl: null,
        creatorFolderName: slugify(creatorName),
        status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
        errorRetryable: retriable
      })
    }
  }

  private async ensureCreator(
    folderName: string,
    displayName: string,
    info: VideoInfo,
    videoUrl: string
  ): Promise<Creator> {
    // Look up by folderName — the on-disk identifier we'll use for the
    // download's output folder. `findById(folderName)` would be wrong:
    // RegisterCreator assigns `id = idGenerator.generate()` (UUID) and
    // `folderName` is a separate field, so they only coincide by accident.
    // This method returns the resolved Creator so the caller can write
    // `video.creatorId = creator.id` — the FK references creators.id, never
    // the folder slug.
    //
    // Edge case still not handled: user types a different display name for
    // an already-registered channel. findByFolderName misses, this method
    // falls through to INSERT, and the UNIQUE on `youtube_channel_id` fires.
    // Resolving that needs a secondary lookup by channelId — out of scope here.
    const existing = this.creatorRepo.findByFolderName(folderName)

    // The per-video yt-dlp JSON doesn't carry the channel thumbnail — only
    // the dedicated channel call (`--flat-playlist --dump-single-json
    // --playlist-items 1`) does, which spawns yt-dlp a second time and
    // costs ~3-5s. We DO NOT await it on the critical path: avatars are
    // purely cosmetic and blocking the download start on a cosmetic
    // metadata fetch is what produced the ~10s "queued" stall users see.
    // Instead, the row is upserted now with `avatarUrl = null`, the
    // download proceeds, and `scheduleAvatarFetch` fires the second
    // yt-dlp call in the background and patches the row when it returns.
    const needsAvatarFetch =
      !existing || (existing.avatarUrl === null && existing.status !== 'deleted')

    let touched: Creator
    if (!existing) {
      const now = new Date().toISOString()
      touched = {
        // Mint a UUID, exactly like RegisterCreator — `folderName` stays the
        // disk key but the entity id must be opaque so the two creation paths
        // share one id convention and the videos.creator_id FK is stable.
        id: this.idGenerator.generate(),
        folderName,
        name: displayName,
        profileImagePath: null,
        youtubeChannelId: info.channelId ?? null,
        youtubeChannelUrl: info.channelUrl ?? null,
        subscriberCount: info.subscriberCount ?? null,
        avatarUrl: null,
        notes: null,
        tags: [],
        status: 'active',
        deletedAt: null,
        createdAt: now,
        updatedAt: now
      }
      this.creatorRepo.upsert(touched)
      try {
        const dir = this.pathResolver.join(this.rootPath.value, folderName)
        this.fsWriter.ensureDirectory(dir)
      } catch (err) {
        console.warn(
          `[DownloadVideo.ensureCreator] Folder creation failed for "${folderName}":`,
          err instanceof Error ? err.message : err
        )
      }
    } else {
      // For an existing creator we may need to: (a) recover from `missing`,
      // or (b) backfill YouTube metadata. avatarUrl backfill is handled by
      // scheduleAvatarFetch out-of-band.
      const needsRecovery = existing.status === 'missing'
      const needsBackfill =
        (!existing.youtubeChannelId && !!info.channelId) ||
        (!existing.youtubeChannelUrl && !!info.channelUrl) ||
        (existing.subscriberCount === null && info.subscriberCount != null)

      if (needsRecovery || needsBackfill) {
        touched = {
          ...existing,
          status: needsRecovery ? 'active' : existing.status,
          deletedAt: needsRecovery ? null : existing.deletedAt,
          youtubeChannelId: existing.youtubeChannelId ?? info.channelId ?? null,
          youtubeChannelUrl: existing.youtubeChannelUrl ?? info.channelUrl ?? null,
          subscriberCount: existing.subscriberCount ?? info.subscriberCount ?? null,
          avatarUrl: existing.avatarUrl,
          updatedAt: new Date().toISOString()
        }
        this.creatorRepo.upsert(touched)
      } else {
        touched = existing
      }
    }

    if (needsAvatarFetch) this.scheduleAvatarFetch(touched, info, videoUrl)

    return touched
  }

  /**
   * Fire-and-forget channel-avatar fetch. Runs in parallel with the actual
   * download so the user perceives no stall; patches the creator row when
   * the URL resolves. Takes the freshly-touched creator directly rather
   * than re-reading — avoids a race window against the very upsert we just
   * did, and keeps test mocks simple (no need to make findByFolderName
   * track prior upserts). Never throws — avatars are cosmetic.
   */
  private scheduleAvatarFetch(creator: Creator, info: VideoInfo, videoUrl: string): void {
    const targetUrl = info.channelUrl ?? videoUrl
    console.log(
      `[DownloadVideo] avatar fetch starting for "${creator.folderName}" via ${targetUrl}`
    )
    void this.fetchChannelAvatar(info, videoUrl, creator.folderName)
      .then((avatarUrl) => {
        if (avatarUrl === null) {
          console.warn(
            `[DownloadVideo] avatar fetch returned null for "${creator.folderName}" — channel had no usable thumbnail or yt-dlp failed silently`
          )
          return
        }
        console.log(
          `[DownloadVideo] avatar fetch resolved for "${creator.folderName}" — persisting`
        )
        this.creatorRepo.upsert({
          ...creator,
          avatarUrl,
          updatedAt: new Date().toISOString()
        })
        this.notifier.notify('db-updated', { scope: ['creators'] })
      })
      .catch((err) => {
        console.warn(
          `[DownloadVideo] background avatar fetch failed for "${creator.folderName}":`,
          err instanceof Error ? err.message : err
        )
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
