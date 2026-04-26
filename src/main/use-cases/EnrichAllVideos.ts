import type { IVideoRepository } from '@domain/repositories'
import type { IDownloadQueue, INotifier } from '@domain/ports'
import type { EnrichVideosResult } from '@shared/types'
import type { IFetchVideoDetail } from './IFetchVideoDetail'
import type { IEnrichAllVideos } from './IEnrichAllVideos'

/**
 * Batch enrichment: fetch extended metadata + transcripts for every active
 * video that has a URL but no `detailFetchedAt` timestamp.
 *
 * Calls are funneled through `IDownloadQueue` (concurrency 1) to keep
 * yt-dlp pressure low. Failures are counted and continue rather than abort.
 */
export class EnrichAllVideos implements IEnrichAllVideos {
  constructor(
    private videoRepo: IVideoRepository,
    private fetchDetail: IFetchVideoDetail,
    private queue: IDownloadQueue,
    private notifier: INotifier
  ) {}

  async execute(): Promise<EnrichVideosResult> {
    const candidates = this.videoRepo.findNeedingDetail()
    const result: EnrichVideosResult = {
      total: candidates.length,
      enriched: 0,
      failed: 0,
      skipped: 0
    }

    for (const video of candidates) {
      if (!video.url) {
        result.skipped++
        continue
      }
      try {
        await this.queue.enqueue(() => this.fetchDetail.execute(video.id))
        result.enriched++
      } catch (err) {
        result.failed++
        console.error(`[klip] EnrichAllVideos failed for ${video.id}:`, err)
      }
    }

    this.notifier.notify('db-updated')
    return result
  }
}
