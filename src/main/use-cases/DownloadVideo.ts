import { randomUUID } from 'crypto'
import type { ICreatorRepository, IVideoRepository } from '@domain/repositories'
import type {
  IVideoDownloader,
  IDownloadQueue,
  IPathResolver,
  IFileSystemWriter,
  INotifier
} from '@domain/ports'
import type { DownloadRequest, DownloadProgress } from '@domain/types'
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
    private rootPath: string
  ) {}

  async execute(request: DownloadRequest): Promise<DownloadVideoResult> {
    const { url, creatorName } = request

    if (!url || url.trim().length === 0) {
      throw new Error('URL is required')
    }
    if (!creatorName || creatorName.trim().length === 0) {
      throw new Error('Creator name is required')
    }

    const downloadId = randomUUID()

    // Notify UI that download is queued
    this.notifier.notify('download-progress', {
      downloadId,
      url,
      percent: 0,
      speed: null,
      eta: null,
      status: 'queued'
    })

    // Enqueue — the task runs when a concurrency slot opens
    this.downloadQueue.enqueue(() => this.performDownload(downloadId, url, creatorName.trim()))

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

      // 2. Ensure creator exists in DB
      this.ensureCreator(creatorName)

      // 3. Prepare output directory
      const outputDir = this.pathResolver.join(this.rootPath, creatorName, 'downloads', videoId)
      this.fsWriter.ensureDirectory(outputDir)

      // 4. Download with progress relay
      const onProgress = (progress: DownloadProgress): void => {
        this.notifier.notify('download-progress', progress)
      }

      const result = await this.downloader.download(
        { url, outputDir, videoId, downloadId },
        onProgress
      )

      // 5. Upsert Video entity
      const now = new Date().toISOString()
      const video: Video = {
        id: videoId,
        creatorId: creatorName,
        title: result.title || info.title || videoId,
        url,
        duration: result.duration ?? info.duration ?? null,
        resolution: null,
        fileSize: null,
        filePath: result.filePath,
        thumbnailPath: result.thumbnailPath,
        downloadDate: now,
        status: 'active',
        deletedAt: null,
        createdAt: now,
        updatedAt: now
      }
      this.videoRepo.upsert(video)

      // 6. Notify UI to refresh
      this.notifier.notify('db-updated')
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

      console.error(`[klip] Download failed (${downloadId}):`, error)
    }
  }

  private ensureCreator(creatorName: string): void {
    const existing = this.creatorRepo.findById(creatorName)
    if (!existing) {
      const now = new Date().toISOString()
      const creator: Creator = {
        id: creatorName,
        name: creatorName,
        profileImagePath: null,
        status: 'active',
        deletedAt: null,
        createdAt: now,
        updatedAt: now
      }
      this.creatorRepo.upsert(creator)
    } else if (existing.status === 'missing') {
      this.creatorRepo.updateStatus(creatorName, 'active', null)
    }
  }
}
