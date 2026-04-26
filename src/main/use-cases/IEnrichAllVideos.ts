import type { EnrichVideosResult } from '@shared/types'

/**
 * Port for the batch video-detail enrichment use case.
 * Walks every active video that has a URL but no `detailFetchedAt`,
 * calling FetchVideoDetail through a concurrency-1 queue.
 */
export interface IEnrichAllVideos {
  execute(): Promise<EnrichVideosResult>
}
