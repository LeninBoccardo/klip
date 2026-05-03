/** Status of a video download lifecycle */
export type DownloadStatus =
  | 'queued'
  | 'downloading'
  | 'processing'
  | 'complete'
  | 'error'
  | 'cancelled'

/** Request to download a video from a URL */
export interface DownloadRequest {
  url: string
  creatorName: string
}

/** Real-time progress update pushed to the renderer */
export interface DownloadProgress {
  downloadId: string
  url: string
  percent: number
  speed: string | null
  eta: string | null
  status: DownloadStatus
  /**
   * Creator name the download was queued for. Carried in every event so the
   * renderer can re-invoke the download on retry without holding session state.
   * Optional because driver-level events (yt-dlp) emit before the use case
   * wraps them; the use case fills it in for terminal events.
   */
  creatorName?: string
  /**
   * Set on `status: 'error'`. True when the failure is transient (network,
   * 5xx, fragment) and a retry might succeed. False/undefined for terminal
   * failures (deleted video, bad URL) — UI hides the Retry button.
   */
  retriable?: boolean
}

/** Successful download result returned by the downloader driver */
export interface DownloadResult {
  downloadId: string
  videoId: string
  creatorName: string
  filePath: string
  title: string
  duration: number | null
  thumbnailPath: string | null
  // ── YouTube channel metadata (from .info.json) ──
  channelId: string | null
  channelUrl: string | null
  subscriberCount: number | null
  viewCount: number | null
}

/** Pre-flight video metadata fetched without downloading */
export interface VideoInfo {
  videoId: string
  title: string
  channel: string | null
  duration: number | null
  thumbnailUrl: string | null
  description: string | null
  // ── YouTube channel metadata (already in yt-dlp JSON) ──
  channelId: string | null
  channelUrl: string | null
  uploaderUrl: string | null
  subscriberCount: number | null
  viewCount: number | null
}
