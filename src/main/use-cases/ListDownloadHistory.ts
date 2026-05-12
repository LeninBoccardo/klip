import type {
  IDownloadHistoryRepository,
  IVideoRepository
} from '@domain/repositories'
import type { DownloadHistoryEntry } from '@domain/entities'
import type { IListDownloadHistory } from './IListDownloadHistory'

/**
 * Returns the most recent N download attempts, newest first.
 *
 * Filter rule: drop `'success'` rows whose video has since been deleted
 * (the "Open video" CTA in the UI would 404 against the removed row).
 * `'error'` rows are kept unconditionally — they record an event that
 * happened, and the user may still want to Retry.
 */
export class ListDownloadHistory implements IListDownloadHistory {
  constructor(
    private historyRepo: IDownloadHistoryRepository,
    private videoRepo: IVideoRepository
  ) {}

  execute(limit: number): DownloadHistoryEntry[] {
    const rows = this.historyRepo.findRecent(limit)
    return rows.filter((entry) => {
      if (entry.status === 'error') return true
      if (entry.videoId === null) return false
      const video = this.videoRepo.findById(entry.videoId)
      // `status === 'deleted'` is a soft delete — the row still exists but
      // the user has tossed it. Drop these too so the Open button never
      // navigates to a tombstone.
      return video !== null && video.status !== 'deleted'
    })
  }
}
