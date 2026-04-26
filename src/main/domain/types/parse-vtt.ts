/**
 * Strip a WebVTT file down to plain text:
 *  - drop the WEBVTT header line and any "NOTE …" / "STYLE …" / "Kind:" / "Language:" metadata
 *  - drop cue identifiers and timing lines ("00:00:00.000 --> 00:00:02.500 …")
 *  - drop blank separator lines
 *  - keep only the spoken cue text, joined with single newlines
 *
 * yt-dlp auto-generated VTTs include duplicated rolling captions; this
 * function de-duplicates consecutive identical cue lines.
 */
export function parseVtt(raw: string): string {
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
