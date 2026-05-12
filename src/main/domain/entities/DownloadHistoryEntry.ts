/**
 * Coarse outcome of a download attempt. `success` produced a Video row in
 * the database; `error` did not (the row never existed or the failure
 * happened before the upsert).
 */
export type DownloadHistoryStatus = 'success' | 'error'

/**
 * Persistent record of one finished download attempt. One row is appended
 * per attempt — retries don't update the previous row, they append a new
 * one, so the table reads as an attempt-by-attempt audit trail.
 */
export interface DownloadHistoryEntry {
  /** Unique id (uuid). Never reused across retries. */
  id: string
  /** Original YouTube URL the user / use-case submitted. */
  youtubeUrl: string
  /**
   * Soft FK to the resulting `videos.id` on success. Null on error.
   * `ListDownloadHistory` filters out rows whose video has since been
   * deleted, so the renderer's "Open video" button is always safe.
   */
  videoId: string | null
  /** Title from yt-dlp at the time of the attempt; null when unknown. */
  videoTitle: string | null
  /** YouTube thumbnail URL captured for the row's preview image. */
  thumbnailUrl: string | null
  /** Slugified creator folder (display purposes only — not a FK). */
  creatorFolderName: string | null
  status: DownloadHistoryStatus
  /** Human-readable error string (yt-dlp stderr or use-case error message). */
  errorMessage: string | null
  /**
   * Whether the Retry button should be enabled for this row.
   *
   * False for terminal-by-design errors like 'duplicate' (the same URL is
   * already in the library) or 'cancelled' (user-initiated cancel). True
   * for transient/network/yt-dlp errors where another attempt could
   * succeed.
   */
  errorRetryable: boolean
  /** ISO timestamp when the row was appended. */
  finishedAt: string
}
