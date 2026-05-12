/**
 * Extended per-video metadata fetched on demand from yt-dlp.
 * Persisted to the videos table when present.
 *
 * Does **not** expose `transcriptPath`. The renderer fetches transcript text
 * via the `get-transcript` IPC channel by entity id; the on-disk path stays
 * inside the main process.
 */
export interface VideoDetail {
  videoId: string
  likeCount: number | null
  dislikeCount: number | null
  commentCount: number | null
  viewCount: number | null
  category: string | null
  tags: string[]
  uploadDate: string | null
  description: string | null
  isShort: boolean
  hasTranscript: boolean
}

/**
 * Outcome of the transcript fetch sub-step inside fetch-video-detail.
 *
 *  - `ok`            — transcript was fetched and persisted (transcriptText is present).
 *  - `unavailable`   — yt-dlp reported no subtitles exist for the video (a permanent state).
 *  - `rate-limited`  — YouTube returned HTTP 429; the user can retry later.
 *  - `error`         — any other failure (network, parse, IO). `transcriptError` carries
 *                      a short, redacted message for the UI to display.
 *  - `not-attempted` — the parent fetch failed before the transcript step ran.
 *
 * The renderer differentiates these on the "Refresh metadata" toast so the
 * user knows whether to retry or give up.
 */
export type TranscriptFetchStatus =
  | 'ok'
  | 'unavailable'
  | 'rate-limited'
  | 'error'
  | 'not-attempted'

/** Renderer payload returned by `fetch-video-detail` — includes parsed transcript text */
export interface VideoDetailWithTranscript extends VideoDetail {
  transcriptText: string | null
  transcriptStatus: TranscriptFetchStatus
  /** Short human-readable message when transcriptStatus !== 'ok'. Null otherwise. */
  transcriptError: string | null
}

/**
 * One timed line from a transcript. Sourced from the on-disk WebVTT file
 * (kept verbatim alongside the media); the renderer uses {@link startMs} both
 * for the displayed timestamp and for seeking the player on click.
 */
export interface TranscriptSegment {
  startMs: number
  endMs: number
  text: string
}

/** Summary returned by the batch enrichment use case */
export interface EnrichVideosResult {
  total: number
  enriched: number
  failed: number
  skipped: number
}

/**
 * Progress event pushed during a batch `EnrichAllVideos` run.
 * `phase: 'starting'` fires once at the beginning so the renderer can show
 * a determinate progress bar; `phase: 'progress'` fires after each video;
 * `phase: 'done'` fires once at the end with the final tallies.
 */
export interface EnrichProgress {
  phase: 'starting' | 'progress' | 'done'
  current: number
  total: number
  enriched: number
  failed: number
  skipped: number
}
