/**
 * Classifies a YouTube-side error from yt-dlp's stderr / fetch result into a
 * lifecycle signal. Used by FetchVideoDetail and EnrichAllVideos to decide
 * whether to flip a video to `status='missing'` (and which reason to record
 * in the audit trail).
 *
 *   - `unavailable`   — the video is gone or removed (404, "Video unavailable")
 *   - `unauthorized`  — the video is restricted (private, age-gated, region)
 *   - `transient`     — network blip, rate limit; the video is probably fine
 *   - `unknown`       — anything else (don't change status; leave for next run)
 *
 * Mirrors the `classifyDownloadError` pattern used for downloads. The
 * categories are intentionally coarse — `unavailable` and `unauthorized`
 * both flip the video to `'missing'`; we record them separately only so the
 * audit log carries useful forensic detail.
 */

const UNAVAILABLE_PATTERNS: readonly RegExp[] = [
  /HTTP Error 404/i,
  /Video unavailable/i,
  /This video has been removed/i,
  /no longer available/i,
  /removed by the uploader/i
] as const

const UNAUTHORIZED_PATTERNS: readonly RegExp[] = [
  /HTTP Error 403/i,
  /Private video/i,
  /Sign in to confirm your age/i,
  /not available in your country/i,
  /not made this video available/i,
  /members.only/i
] as const

const TRANSIENT_PATTERNS: readonly RegExp[] = [
  /ETIMEDOUT/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /EAI_AGAIN/i,
  /HTTP Error 5\d{2}/i,
  /HTTP Error 408/i,
  /HTTP Error 429/i,
  /timed? out/i,
  /unable to (connect|download webpage)/i,
  /temporary failure/i
] as const

export type YoutubeErrorKind = 'unavailable' | 'unauthorized' | 'transient' | 'unknown'

export function classifyYoutubeError(error: unknown): YoutubeErrorKind {
  const message = error instanceof Error ? error.message : String(error ?? '')

  for (const pattern of UNAVAILABLE_PATTERNS) {
    if (pattern.test(message)) return 'unavailable'
  }
  for (const pattern of UNAUTHORIZED_PATTERNS) {
    if (pattern.test(message)) return 'unauthorized'
  }
  for (const pattern of TRANSIENT_PATTERNS) {
    if (pattern.test(message)) return 'transient'
  }
  return 'unknown'
}

/**
 * Convenience: did the YouTube response indicate the video should be
 * marked `missing`? True for `unavailable | unauthorized`; false for
 * transient/unknown.
 */
export function shouldMarkMissing(kind: YoutubeErrorKind): boolean {
  return kind === 'unavailable' || kind === 'unauthorized'
}
