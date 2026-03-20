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
}

/** Pre-flight video metadata fetched without downloading */
export interface VideoInfo {
  videoId: string
  title: string
  channel: string | null
  duration: number | null
  thumbnailUrl: string | null
  description: string | null
}
