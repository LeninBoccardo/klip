/**
 * Classifies a download error as either retriable (transient — network blip,
 * rate limit, partial fragment) or terminal (the URL is bad, the video is
 * deleted, the binary is missing). The renderer uses this flag to show the
 * "Retry" button only when retrying might actually succeed.
 *
 * The classifier reads from the error message because yt-dlp does not expose
 * structured error codes — its stderr is the only signal we have.
 */

const RETRIABLE_PATTERNS: readonly RegExp[] = [
  /ETIMEDOUT/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /EAI_AGAIN/i,
  /network/i,
  /HTTP Error 5\d{2}/i,
  /HTTP Error 408/i,
  /HTTP Error 429/i,
  /timed? out/i,
  /unable to (connect|download webpage)/i,
  /fragment/i,
  /temporary failure/i
] as const

export function classifyDownloadError(error: unknown): 'retriable' | 'terminal' {
  const message = error instanceof Error ? error.message : String(error ?? '')
  for (const pattern of RETRIABLE_PATTERNS) {
    if (pattern.test(message)) return 'retriable'
  }
  return 'terminal'
}
