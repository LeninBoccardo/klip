const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be'
])

export function isYouTubeUrl(input: string): boolean {
  try {
    const url = new URL(input.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    return YOUTUBE_HOSTS.has(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

export function isHttpUrl(input: string): boolean {
  try {
    const url = new URL(input.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

// text/uri-list may contain comment lines (prefixed with `#`) and multiple URLs;
// per RFC 2483 we must skip comments and return the first valid URL.
export function extractFirstUrl(text: string): string | null {
  if (!text) return null
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    if (isHttpUrl(line)) return line
  }
  return null
}
