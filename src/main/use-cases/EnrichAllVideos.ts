import type { IVideoRepository } from '@domain/repositories'
import type { IDownloadQueue, INotifier } from '@domain/ports'
import type { EnrichVideosResult } from '@shared/types'
import { redactError } from '@domain/types/redact'
import type { IFetchVideoDetail } from './IFetchVideoDetail'
import type { IEnrichAllVideos } from './IEnrichAllVideos'

/**
 * Batch enrichment: fetch extended metadata + transcripts for every active
 * video that has a URL but no `detailFetchedAt` timestamp.
 *
 * Funnels every per-video fetch through a **dedicated** `IDownloadQueue` —
 * separate from the user-facing download queue — so YouTube rate-limit pressure
 * is bounded predictably regardless of what the user is doing in the
 * Downloads page. Failures are counted and the loop continues rather than
 * aborting the batch.
 *
 * Emits `enrich-progress` push events on every transition so the renderer can
 * render a determinate progress bar.
 */
export class EnrichAllVideos implements IEnrichAllVideos {
  constructor(
    private videoRepo: IVideoRepository,
    private fetchDetail: IFetchVideoDetail,
    private queue: IDownloadQueue,
    private notifier: INotifier
  ) {}

  async execute(): Promise<EnrichVideosResult> {
    // First-time enrichment + retry of previously-missing videos in one
    // pass. New videos go first (user just downloaded them and is most
    // likely watching), then we attempt to recover any flagged-missing
    // rows from prior failed runs. FetchVideoDetail handles the status
    // flips on success / permanent failure.
    const newCandidates = this.videoRepo.findNeedingDetail()
    const recovery = this.videoRepo.findMissingForRecovery()
    const candidates = [...newCandidates, ...recovery]
    const result: EnrichVideosResult = {
      total: candidates.length,
      enriched: 0,
      failed: 0,
      skipped: 0
    }

    // Initial event so the UI flips to "in progress" immediately, even when
    // the queue is empty.
    this.notifier.notify('enrich-progress', {
      phase: 'starting',
      current: 0,
      total: result.total,
      enriched: 0,
      failed: 0,
      skipped: 0
    })

    let current = 0
    for (const video of candidates) {
      current++
      if (!video.url) {
        result.skipped++
      } else {
        try {
          await this.queue.enqueue(() => this.fetchDetail.execute(video.id))
          result.enriched++
        } catch (err) {
          result.failed++
          console.error(`[klip] EnrichAllVideos failed for ${video.id}:`, redactError(err))
        }
      }
      this.notifier.notify('enrich-progress', {
        phase: 'progress',
        current,
        total: result.total,
        enriched: result.enriched,
        failed: result.failed,
        skipped: result.skipped
      })
    }

    this.notifier.notify('enrich-progress', {
      phase: 'done',
      current: result.total,
      total: result.total,
      enriched: result.enriched,
      failed: result.failed,
      skipped: result.skipped
    })
    this.notifier.notify('db-updated', { scope: ['videos'] })
    return result
  }
}
