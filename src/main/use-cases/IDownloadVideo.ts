import type { DownloadRequest } from '@domain/types'

/** Result returned to the caller when a download is enqueued */
export interface DownloadVideoResult {
  downloadId: string
}

/**
 * Port for the video download use case.
 * Enqueues a download and returns immediately with a tracking ID.
 */
export interface IDownloadVideo {
  /** Enqueue a video download; returns the downloadId for tracking */
  execute(request: DownloadRequest): Promise<DownloadVideoResult>

  /** Cancel an in-progress or queued download */
  cancel(downloadId: string): void
}
