import type { ICreatorRepository, IDownloadHistoryRepository } from '@domain/repositories'
import type { IDownloadVideo, DownloadVideoResult } from './IDownloadVideo'
import type { IRetryDownload } from './IRetryDownload'

/**
 * Re-runs a failed download attempt from a `download_history` row.
 *
 * Resolves the original URL + creator name out of history and hands them to
 * the standard `DownloadVideo` use-case — the new attempt appends its own
 * success/error row, so the history table records the full retry chain.
 *
 * Rejects with a typed error if the user clicks Retry on a row whose
 * `errorRetryable` is false (duplicate, cancelled). The renderer's UI
 * already disables that button; this is defence-in-depth so a programmatic
 * caller can't bypass it.
 */
export class RetryDownload implements IRetryDownload {
  constructor(
    private historyRepo: IDownloadHistoryRepository,
    private creatorRepo: ICreatorRepository,
    private downloadVideo: IDownloadVideo
  ) {}

  async execute(historyId: string): Promise<DownloadVideoResult> {
    const entry = this.historyRepo.findById(historyId)
    if (!entry) throw new Error(`Download history entry not found: ${historyId}`)
    if (entry.status === 'success') {
      throw new Error('Cannot retry: this attempt already succeeded.')
    }
    if (!entry.errorRetryable) {
      throw new Error('Cannot retry: this failure is marked non-retryable.')
    }

    // Recover the display name (DownloadVideo re-slugs it) — prefer the
    // captured folder name, fall back to the creator's display name if a
    // folder match still resolves, then to the slug verbatim. This keeps
    // a retry from accidentally registering a different creator just
    // because the display-name lookup misses.
    let creatorName = entry.creatorFolderName ?? ''
    if (entry.creatorFolderName) {
      const creator = this.creatorRepo.findByFolderName(entry.creatorFolderName)
      if (creator) creatorName = creator.name
    }
    if (!creatorName) {
      throw new Error('Cannot retry: original creator could not be resolved.')
    }

    return this.downloadVideo.execute({ url: entry.youtubeUrl, creatorName })
  }
}
