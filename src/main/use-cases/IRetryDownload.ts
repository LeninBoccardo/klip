import type { DownloadVideoResult } from './IDownloadVideo'

export interface IRetryDownload {
  /**
   * Resolves with a fresh downloadId. Throws if the history entry doesn't
   * exist or its `errorRetryable` is false.
   */
  execute(historyId: string): Promise<DownloadVideoResult>
}
