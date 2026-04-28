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

/** Renderer payload returned by `fetch-video-detail` — includes parsed transcript text */
export interface VideoDetailWithTranscript extends VideoDetail {
  transcriptText: string | null
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
