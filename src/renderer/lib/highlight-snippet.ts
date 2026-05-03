import { TRANSCRIPT_SNIPPET_OPEN, TRANSCRIPT_SNIPPET_CLOSE } from '@shared/types'

export interface SnippetSegment {
  /** Whether this segment was emitted between the FTS5 markers. */
  highlighted: boolean
  text: string
}

/**
 * Split a transcript snippet on the `<<<` / `>>>` markers emitted by SQLite's
 * `snippet()` function. Returns alternating plain/highlighted segments so the
 * renderer can wrap matches in `<mark>` without touching innerHTML.
 *
 * Defensive — unbalanced markers are tolerated (everything after a stray
 * opener is still rendered, just unhighlighted past the missing closer).
 */
export function parseSnippet(snippet: string): SnippetSegment[] {
  const segments: SnippetSegment[] = []
  let cursor = 0
  while (cursor < snippet.length) {
    const openIdx = snippet.indexOf(TRANSCRIPT_SNIPPET_OPEN, cursor)
    if (openIdx === -1) {
      segments.push({ highlighted: false, text: snippet.slice(cursor) })
      break
    }
    if (openIdx > cursor) {
      segments.push({ highlighted: false, text: snippet.slice(cursor, openIdx) })
    }
    const afterOpen = openIdx + TRANSCRIPT_SNIPPET_OPEN.length
    const closeIdx = snippet.indexOf(TRANSCRIPT_SNIPPET_CLOSE, afterOpen)
    if (closeIdx === -1) {
      segments.push({ highlighted: false, text: snippet.slice(afterOpen) })
      break
    }
    segments.push({ highlighted: true, text: snippet.slice(afterOpen, closeIdx) })
    cursor = closeIdx + TRANSCRIPT_SNIPPET_CLOSE.length
  }
  return segments
}
