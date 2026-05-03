/**
 * One row of an FTS5 match against the videos transcript index.
 *
 * `snippet` is the highlighted excerpt produced by SQLite's `snippet()` —
 * by convention markers wrap each matched term so the renderer can style
 * them. The match marker is `<<<` ... `>>>` (chosen to be unambiguous in
 * VTT-derived plain text).
 */
export interface TranscriptSearchHit {
  videoId: string
  title: string
  /** Snippet from the transcript with `<<<term>>>` markers, or null when only the title matched. */
  snippet: string | null
  /** Lower (more negative) is a better match per FTS5's bm25 ranking. */
  rank: number
}

export interface TranscriptSearchResult {
  hits: TranscriptSearchHit[]
  /** Total matches before any limit was applied (capped to a sensible ceiling for perf). */
  totalApproximate: number
}

export interface SearchTranscriptsParams {
  query: string
  limit: number
  offset: number
}

export const TRANSCRIPT_SNIPPET_OPEN = '<<<'
export const TRANSCRIPT_SNIPPET_CLOSE = '>>>'
