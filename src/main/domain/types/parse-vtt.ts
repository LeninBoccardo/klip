/**
 * Hard upper bound for VTT input. Real yt-dlp transcripts top out around
 * 1 MB even for multi-hour streams; 10 MB is generous slack while still
 * capping the worst case from a tampered or malformed file (the inline-tag
 * stripper at line 39 has pathological backtracking on unbalanced `<`).
 */
const MAX_VTT_BYTES = 10 * 1024 * 1024

export class VttTooLargeError extends Error {
  readonly name = 'VttTooLargeError'
  constructor(public readonly size: number) {
    super(`VTT input is ${size} bytes (max ${MAX_VTT_BYTES})`)
  }
}

/**
 * Strip a WebVTT file down to plain text:
 *  - drop the WEBVTT header line and any "NOTE …" / "STYLE …" / "Kind:" / "Language:" metadata
 *  - drop cue identifiers and timing lines ("00:00:00.000 --> 00:00:02.500 …")
 *  - drop blank separator lines
 *  - keep only the spoken cue text, joined with single newlines
 *
 * yt-dlp auto-generated VTTs include duplicated rolling captions; this
 * function de-duplicates consecutive identical cue lines.
 *
 * Throws {@link VttTooLargeError} if `raw` exceeds {@link MAX_VTT_BYTES}.
 */
export function parseVtt(raw: string): string {
  if (raw.length > MAX_VTT_BYTES) throw new VttTooLargeError(raw.length)
  const lines = raw.split(/\r?\n/)
  const out: string[] = []
  let lastPushed: string | null = null
  let inBlockToSkip = false

  for (const line of lines) {
    const trimmed = line.trim()

    // NOTE / STYLE blocks span until the next blank line per WebVTT spec
    if (inBlockToSkip) {
      if (trimmed === '') {
        inBlockToSkip = false
      }
      continue
    }
    if (trimmed === 'NOTE' || trimmed.startsWith('NOTE ') || trimmed === 'STYLE') {
      inBlockToSkip = true
      continue
    }

    if (trimmed === '') continue
    if (trimmed === 'WEBVTT' || trimmed.startsWith('WEBVTT ')) continue
    if (trimmed.startsWith('Kind:') || trimmed.startsWith('Language:')) continue
    // Timing line e.g. "00:00:01.000 --> 00:00:03.000 align:start position:0%"
    if (trimmed.includes('-->')) continue

    // Strip inline tags <c>, <00:00:01.000>, etc.
    const cleaned = trimmed.replace(/<[^>]+>/g, '').trim()
    if (cleaned === '') continue
    if (cleaned === lastPushed) continue
    out.push(cleaned)
    lastPushed = cleaned
  }

  return out.join('\n')
}

export interface TranscriptSegment {
  /** Cue start, in milliseconds from the start of the media. */
  startMs: number
  /** Cue end, in milliseconds. May equal startMs for zero-length cues. */
  endMs: number
  /** Spoken text for the cue, inline tags stripped. */
  text: string
}

/**
 * Parse a WebVTT into timed segments. Unlike {@link parseVtt}, this preserves
 * cue start/end timestamps and emits one segment per cue group.
 *
 * yt-dlp auto-generated captions repeat each cue with progressively-revealed
 * inline timing tags ("rolling captions"). After tag stripping, consecutive
 * identical lines are merged into the earlier segment by extending its endMs
 * — so the renderer sees one segment per spoken line, not the same line
 * three times.
 *
 * Throws {@link VttTooLargeError} when `raw` exceeds {@link MAX_VTT_BYTES}.
 */
export function parseVttSegments(raw: string): TranscriptSegment[] {
  if (raw.length > MAX_VTT_BYTES) throw new VttTooLargeError(raw.length)
  const lines = raw.split(/\r?\n/)
  const segments: TranscriptSegment[] = []
  let inBlockToSkip = false
  let pendingStartMs: number | null = null
  let pendingEndMs: number | null = null
  let pendingTextLines: string[] = []

  const flushPending = (): void => {
    if (pendingStartMs === null || pendingEndMs === null) return
    const text = pendingTextLines.join(' ').replace(/\s+/g, ' ').trim()
    pendingTextLines = []
    if (text === '') {
      pendingStartMs = null
      pendingEndMs = null
      return
    }
    const last = segments[segments.length - 1]
    if (last && last.text === text) {
      // Same caption text seen earlier (rolling-caption duplication); just
      // extend the original segment's end time rather than emitting a clone.
      last.endMs = Math.max(last.endMs, pendingEndMs)
    } else {
      segments.push({ startMs: pendingStartMs, endMs: pendingEndMs, text })
    }
    pendingStartMs = null
    pendingEndMs = null
  }

  for (const line of lines) {
    const trimmed = line.trim()

    if (inBlockToSkip) {
      if (trimmed === '') inBlockToSkip = false
      continue
    }
    if (trimmed === 'NOTE' || trimmed.startsWith('NOTE ') || trimmed === 'STYLE') {
      inBlockToSkip = true
      continue
    }
    if (trimmed === 'WEBVTT' || trimmed.startsWith('WEBVTT ')) continue
    if (trimmed.startsWith('Kind:') || trimmed.startsWith('Language:')) continue

    if (trimmed.includes('-->')) {
      // Timing line marks the start of a new cue — flush whatever was pending.
      flushPending()
      const parsed = parseTimingLine(trimmed)
      if (parsed) {
        pendingStartMs = parsed.startMs
        pendingEndMs = parsed.endMs
      }
      continue
    }

    if (trimmed === '') {
      // Blank line ends a cue.
      flushPending()
      continue
    }

    if (pendingStartMs === null) {
      // Stray text outside any cue (e.g. cue identifier line). Ignore.
      continue
    }

    const cleaned = trimmed.replace(/<[^>]+>/g, '').trim()
    if (cleaned !== '') pendingTextLines.push(cleaned)
  }

  // Trailing cue without a final blank line.
  flushPending()

  return segments
}

/**
 * Parse a "HH:MM:SS.mmm --> HH:MM:SS.mmm [cue settings]" line. Returns null
 * if either side fails to parse; the caller treats that as a malformed cue
 * and skips it rather than throwing.
 */
function parseTimingLine(line: string): { startMs: number; endMs: number } | null {
  const arrowIdx = line.indexOf('-->')
  if (arrowIdx < 0) return null
  const left = line.slice(0, arrowIdx).trim()
  // Cue settings (align:start position:0% line:80% …) live after the second
  // timestamp; strip them by taking only the first whitespace-delimited token.
  const right = line.slice(arrowIdx + 3).trim().split(/\s+/)[0] ?? ''
  const startMs = parseTimestamp(left)
  const endMs = parseTimestamp(right)
  if (startMs === null || endMs === null) return null
  return { startMs, endMs }
}

/** Convert "HH:MM:SS.mmm" or "MM:SS.mmm" to milliseconds. */
function parseTimestamp(ts: string): number | null {
  const m = ts.match(/^(?:(\d+):)?(\d+):(\d+)(?:[.,](\d{1,3}))?$/)
  if (!m) return null
  const hours = m[1] ? Number(m[1]) : 0
  const minutes = Number(m[2])
  const seconds = Number(m[3])
  const millis = m[4] ? Number(m[4].padEnd(3, '0')) : 0
  if (!Number.isFinite(hours + minutes + seconds + millis)) return null
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis
}
