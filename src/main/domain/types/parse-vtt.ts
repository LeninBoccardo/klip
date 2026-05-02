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
