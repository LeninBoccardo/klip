import type { DownloadProgress } from '@domain/types'

/**
 * Pure helpers extracted from YtDlpDownloader so the parsing/selection logic
 * can be tested without spawning a child process. The class delegates to
 * these; do not inline them back.
 */

interface YtDlpThumbnail {
  url: string
  width?: number
  height?: number
  id?: string
}

/**
 * Parse a yt-dlp progress template line.
 * Expected format: "  42.5%|  2.50MiB/s|00:15"
 *
 * Returns null for lines that don't match the template (yt-dlp emits other
 * status lines on the same stdout) so the caller can skip them.
 */
export function parseProgressLine(
  line: string,
  downloadId: string,
  url: string
): DownloadProgress | null {
  const parts = line.split('|')
  if (parts.length < 3) return null

  const percentStr = parts[0].trim().replace('%', '')
  const percent = parseFloat(percentStr)
  if (isNaN(percent)) return null

  const speed = parts[1]?.trim() || null
  const eta = parts[2]?.trim() || null

  return {
    downloadId,
    url,
    percent,
    speed: speed === 'N/A' ? null : speed,
    eta: eta === 'N/A' ? null : eta,
    status: 'downloading'
  }
}

/**
 * Pick the channel avatar URL from a yt-dlp `thumbnails` array.
 *
 * yt-dlp's flat-playlist output for a YouTube channel exposes both the wide
 * banner and the square avatar in the same array. We want the avatar:
 *   1. Prefer entries whose `id` contains "avatar" (yt-dlp tags them).
 *   2. Otherwise prefer near-square (aspect ratio 0.8–1.25), largest by area.
 *   3. Fall back to the largest by area regardless of shape.
 */
export function pickChannelAvatar(thumbnails: unknown): string | null {
  if (!Array.isArray(thumbnails) || thumbnails.length === 0) return null

  const candidates = thumbnails.filter(
    (t): t is YtDlpThumbnail => !!t && typeof (t as { url?: unknown }).url === 'string'
  )
  if (candidates.length === 0) return null

  const tagged = candidates.filter((t) => t.id?.toLowerCase().includes('avatar'))
  if (tagged.length > 0) return largestByArea(tagged).url

  const square = candidates.filter((t) => {
    if (!t.width || !t.height) return false
    const ratio = t.width / t.height
    return ratio >= 0.8 && ratio <= 1.25
  })
  if (square.length > 0) return largestByArea(square).url

  return largestByArea(candidates).url
}

export function largestByArea<T extends { width?: number; height?: number }>(items: T[]): T {
  return items.reduce((best, t) => {
    const area = (t.width ?? 0) * (t.height ?? 0)
    const bestArea = (best.width ?? 0) * (best.height ?? 0)
    return area > bestArea ? t : best
  })
}
