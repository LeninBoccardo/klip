import type { DownloadHistoryEntry } from '@domain/entities'

/**
 * Append-only persistence port for the finished-downloads ledger.
 *
 *   - `append` writes one row per finished attempt (success or error).
 *   - `findRecent` powers the Downloads page's history pane; ordering is
 *     newest-first and bounded by the caller.
 *   - `findById` is used by RetryDownload to recover the URL + creator
 *     when the user clicks Retry on a specific row.
 *   - `deleteOlderThan` is reserved for a future cleanup job; not used
 *     by the UI today but exposed so we don't have to grow the API
 *     surface in a follow-up commit.
 */
export interface IDownloadHistoryRepository {
  append(entry: DownloadHistoryEntry): void
  findRecent(limit: number): DownloadHistoryEntry[]
  findById(id: string): DownloadHistoryEntry | null
  deleteOlderThan(isoDate: string): number
}
