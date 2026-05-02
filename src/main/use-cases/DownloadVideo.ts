import type { ICreatorRepository, IVideoRepository } from '@domain/repositories'
import type {
  IVideoDownloader,
  IDownloadQueue,
  IPathResolver,
  IFileSystemWriter,
  INotifier,
  IIdGenerator,
  RootPathRef
} from '@domain/ports'
import type { DownloadRequest, DownloadProgress, VideoInfo } from '@domain/types'
import { slugify } from '@domain/types'
import { redactError } from '@domain/types/redact'
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
      status: 'queued'
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
    this.downloadQueue
      .enqueue(() => this.performDownload(downloadId, url, creatorName.trim()))
      .catch((err) => {
        this.notifier.notify('download-progress', {
          downloadId,
          url,
          percent: 0,
          speed: null,
          eta: null,
          status: 'error'
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

      // 2. Slugify creator name for disk/DB identity
      const folderName = slugify(creatorName)

      // 3. Ensure creator exists in DB
      this.ensureCreator(folderName, creatorName, info)

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
          this.notifier.notify('download-progress', progress)
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

      // Notify error
      this.notifier.notify('download-progress', {
        downloadId,
        url,
        percent: 0,
        speed: null,
        eta: null,
        status: 'error'
      })

      console.error(
        `[klip] Download failed (${downloadId}):`,
        redactError(error, this.rootPath.value)
      )
    }
  }

  private ensureCreator(folderName: string, displayName: string, info: VideoInfo): void {
    const existing = this.creatorRepo.findById(folderName)
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
        avatarUrl: null,
        notes: null,
        tags: [],
        status: 'active',
        deletedAt: null,
        createdAt: now,
        updatedAt: now
      }
      this.creatorRepo.upsert(creator)
      return
    }

    // For an existing creator we may need to: (a) recover from `missing`,
    // (b) backfill YouTube metadata, or both. A creator that disappeared and
    // is now reappearing via a download should also pick up any newly-available
    // metadata in the same upsert.
    const needsRecovery = existing.status === 'missing'
    const needsBackfill =
      (!existing.youtubeChannelId && !!info.channelId) ||
      (!existing.youtubeChannelUrl && !!info.channelUrl) ||
      (existing.subscriberCount === null && info.subscriberCount != null)

    if (!needsRecovery && !needsBackfill) return

    this.creatorRepo.upsert({
      ...existing,
      status: needsRecovery ? 'active' : existing.status,
      deletedAt: needsRecovery ? null : existing.deletedAt,
      youtubeChannelId: existing.youtubeChannelId ?? info.channelId ?? null,
      youtubeChannelUrl: existing.youtubeChannelUrl ?? info.channelUrl ?? null,
      subscriberCount: existing.subscriberCount ?? info.subscriberCount ?? null,
      updatedAt: new Date().toISOString()
    })
  }
}
