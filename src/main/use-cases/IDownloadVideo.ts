import type { DownloadRequest } from '@domain/types'
import type { DownloadVideoResult } from '@shared/types'

/** Re-exported from shared — canonical definition lives in @shared/types */
export type { DownloadVideoResult } from '@shared/types'

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
