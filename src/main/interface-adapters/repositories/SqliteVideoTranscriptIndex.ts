import type BetterSqlite3 from 'better-sqlite3'
import type { IVideoTranscriptIndex } from '@domain/ports'
import type { TranscriptSearchHit } from '@shared/types'
import { TRANSCRIPT_SNIPPET_OPEN, TRANSCRIPT_SNIPPET_CLOSE } from '@shared/types'

/**
 * Build an FTS5 phrase query from arbitrary user input. Wrapping the query in
 * double quotes turns it into a phrase (so `+`, `-`, `*`, `NEAR`, etc lose
 * their FTS5 special meaning) and doubling internal `"` is the standard
 * escape — the same pattern SQLite uses for identifiers.
 *
 * Empty or whitespace-only input returns null (callers should bail rather
 * than emit a no-op MATCH).
 */
export function buildFtsPhraseQuery(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  return `"${trimmed.replace(/"/g, '""')}"`
}

/**
 * SQLite FTS5-backed transcript index. All queries hit the raw better-sqlite3
 * handle since Drizzle doesn't model virtual tables.
 */
export class SqliteVideoTranscriptIndex implements IVideoTranscriptIndex {
  constructor(private readonly raw: BetterSqlite3.Database) {}

  search(query: string, limit: number, offset: number): TranscriptSearchHit[] {
    const phrase = buildFtsPhraseQuery(query)
    if (!phrase) return []

    // We snippet column 2 (transcript_text). When only the title matches and
    // transcript_text doesn't contain the term, snippet() returns the first
    // 32 tokens with no markers — we coerce that to null at the JS layer
    // so the renderer can render a title-only hit cleanly.
    const stmt = this.raw.prepare<
      [string, string, string, number, number],
      { videoId: string; title: string; snippet: string; rank: number }
    >(
      `SELECT
         f.video_id AS videoId,
         f.title AS title,
         snippet(videos_fts, 2, ?, ?, '...', 32) AS snippet,
         f.rank AS rank
       FROM videos_fts f
       JOIN videos v ON v.id = f.video_id
       WHERE videos_fts MATCH ?
         AND v.status = 'active'
       ORDER BY f.rank
       LIMIT ? OFFSET ?`
    )

    const rows = stmt.all(
      TRANSCRIPT_SNIPPET_OPEN,
      TRANSCRIPT_SNIPPET_CLOSE,
      phrase,
      Math.max(1, Math.min(limit, 200)),
      Math.max(0, offset)
    ) as Array<{ videoId: string; title: string; snippet: string; rank: number }>

    return rows.map((r) => ({
      videoId: r.videoId,
      title: r.title,
      snippet: r.snippet.includes(TRANSCRIPT_SNIPPET_OPEN) ? r.snippet : null,
      rank: r.rank
    }))
  }

  countApproximate(query: string, cap: number): number {
    const phrase = buildFtsPhraseQuery(query)
    if (!phrase) return 0
    const safeCap = Math.max(1, Math.min(cap, 10_000))
    // Wrap the MATCH in a subquery so the LIMIT bounds the count work.
    const stmt = this.raw.prepare<[string, number], { c: number }>(
      `SELECT COUNT(*) AS c FROM (
         SELECT 1 FROM videos_fts f
         JOIN videos v ON v.id = f.video_id
         WHERE videos_fts MATCH ? AND v.status = 'active'
         LIMIT ?
       )`
    )
    const row = stmt.get(phrase, safeCap)
    return row?.c ?? 0
  }

  setTranscriptText(videoId: string, text: string | null): void {
    const stmt = this.raw.prepare(
      `UPDATE videos SET transcript_text = ?, updated_at = ? WHERE id = ?`
    )
    stmt.run(text, new Date().toISOString(), videoId)
  }

  findVideosNeedingBackfill(): { id: string; transcriptPath: string }[] {
    const stmt = this.raw.prepare<[], { id: string; transcriptPath: string }>(
      `SELECT id, transcript_path AS transcriptPath
       FROM videos
       WHERE transcript_path IS NOT NULL
         AND transcript_text IS NULL
         AND status = 'active'`
    )
    return stmt.all() as Array<{ id: string; transcriptPath: string }>
  }
}
