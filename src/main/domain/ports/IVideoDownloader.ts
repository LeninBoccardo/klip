import type { DownloadProgress, DownloadResult, VideoInfo } from '@domain/types'

/** Options passed to the download method */
export interface DownloadOptions {
  url: string
  outputDir: string
  videoId: string
  downloadId: string
}

/**
 * Abstraction over the external video downloader binary (yt-dlp).
 *
 * Implementations spawn a child process, stream progress updates
 * via the `onProgress` callback, and resolve with the final result.
 */
export interface IVideoDownloader {
  /** Fetch metadata for a URL without downloading */
  fetchInfo(url: string): Promise<VideoInfo>

  /** Download a video to the given output directory, streaming progress */
  download(
    options: DownloadOptions,
    onProgress: (progress: DownloadProgress) => void
  ): Promise<DownloadResult>

  /** Cancel an in-progress download by its ID */
  cancel(downloadId: string): void
}
