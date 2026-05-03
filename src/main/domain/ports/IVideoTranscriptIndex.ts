import type { TranscriptSearchHit } from '@shared/types'

/**
 * Read/write port over the FTS5 transcript index (the `videos_fts` virtual
 * table). Search is a query against `videos_fts MATCH ?`; writes go through
 * `videos.transcript_text` and the triggers in 0009 keep the FTS table in
 * sync.
 *
 * Kept as a port (not folded into IVideoRepository) so the search call site
 * doesn't need to load full Video rows just to render snippets.
 */
export interface IVideoTranscriptIndex {
  /**
   * Run an FTS5 phrase query and return ranked snippets. `query` is treated
   * as the user's literal phrase — the implementation escapes FTS5 syntax
   * characters before delegating to MATCH.
   *
   * Hits include only videos with `status = 'active'`.
   */
  search(query: string, limit: number, offset: number): TranscriptSearchHit[]

  /**
   * Approximate count of matches for `query`. Capped internally for perf — a
   * 1000+ match haul shouldn't make the `/search` page block on COUNT(*).
   */
  countApproximate(query: string, cap: number): number

  /**
   * Update `videos.transcript_text` for one video. The FTS trigger picks
   * up the change and rewrites the corresponding `videos_fts` row.
   */
  setTranscriptText(videoId: string, text: string | null): void

  /**
   * Returns videos that have a transcript_path but no transcript_text — the
   * candidate set for boot-time backfill.
   */
  findVideosNeedingBackfill(): { id: string; transcriptPath: string }[]
}
