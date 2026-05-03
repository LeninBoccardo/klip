export interface BackfillTranscriptIndexResult {
  /** Number of videos that already had `transcript_text` and were skipped. */
  alreadyIndexed: number
  /** Number of videos whose VTT was successfully parsed and indexed. */
  indexed: number
  /** Number of videos whose VTT file was missing or unreadable. */
  missing: number
  /** Number of videos whose VTT failed to parse (logged, left unindexed). */
  failed: number
}

/**
 * Walk every active video that has a `transcript_path` but no
 * `transcript_text`, parse the VTT, and write the plain-text into
 * `videos.transcript_text` (the FTS triggers handle the rest).
 *
 * Idempotent — safe to run on every app boot.
 */
export interface IBackfillTranscriptIndex {
  execute(): Promise<BackfillTranscriptIndexResult>
}
