import type { DownloadProgress, DownloadResult, VideoInfo, ChannelInfo } from '@domain/types'
import type { VideoDetail } from '@shared/types'

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

  /** Fetch channel-level metadata from a channel/handle URL */
  fetchChannelInfo(channelUrl: string): Promise<ChannelInfo>

  /**
   * Fetch extended per-video metadata (likes, comments, category, tags,
   * description, isShort, etc.) without downloading the media file.
   */
  fetchVideoDetail(url: string): Promise<Omit<VideoDetail, 'hasTranscript' | 'transcriptPath'>>

  /**
   * Fetch the auto-generated transcript for a video.
   * Writes a `.vtt` file to `outputDir` and returns its path, or null if no
   * auto-subtitles are available for the requested language.
   */
  fetchTranscript(url: string, outputDir: string, lang?: string): Promise<string | null>

  /** Download a video to the given output directory, streaming progress */
  download(
    options: DownloadOptions,
    onProgress: (progress: DownloadProgress) => void
  ): Promise<DownloadResult>

  /** Cancel an in-progress download by its ID */
  cancel(downloadId: string): void
}
