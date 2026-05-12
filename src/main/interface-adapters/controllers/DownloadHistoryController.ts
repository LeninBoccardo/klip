import type { IListDownloadHistory } from '@use-cases/IListDownloadHistory'
import type { IRetryDownload } from '@use-cases/IRetryDownload'
import { createTypedHandler } from './create-typed-handler'
import type { DownloadHistoryEntryDto } from '@shared/dtos'
import type { DownloadHistoryEntry } from '@domain/entities'

function toDto(entry: DownloadHistoryEntry): DownloadHistoryEntryDto {
  return {
    id: entry.id,
    youtubeUrl: entry.youtubeUrl,
    videoId: entry.videoId,
    videoTitle: entry.videoTitle,
    thumbnailUrl: entry.thumbnailUrl,
    creatorFolderName: entry.creatorFolderName,
    status: entry.status,
    errorMessage: entry.errorMessage,
    errorRetryable: entry.errorRetryable,
    finishedAt: entry.finishedAt
  }
}

/**
 * IPC controller for the finished-downloads ledger.
 *
 *   - `list-download-history` → newest-first list with deleted-video rows
 *     filtered out so the renderer's "Open video" button never 404s.
 *   - `retry-download`        → re-runs the original DownloadVideo flow for
 *     a failed entry, returning the new downloadId so the renderer can
 *     subscribe to its progress events.
 */
export function registerDownloadHistoryController(
  listDownloadHistory: IListDownloadHistory,
  retryDownload: IRetryDownload
): void {
  createTypedHandler('list-download-history', async (_event, limit) => {
    return listDownloadHistory.execute(limit).map(toDto)
  })

  createTypedHandler('retry-download', async (_event, historyId) => {
    return retryDownload.execute(historyId)
  })
}
