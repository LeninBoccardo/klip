/**
 * Extended per-video metadata fetched on demand from yt-dlp.
 * Persisted to the videos table when present.
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
  transcriptPath: string | null
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
