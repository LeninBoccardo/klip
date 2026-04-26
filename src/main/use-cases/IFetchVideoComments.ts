import type { VideoCommentsResult } from '@shared/types'

/**
 * Port for fetching YouTube comments for a video on demand.
 * Comments are NOT persisted to the database — the result is returned
 * directly to the caller and discarded once the renderer drops it.
 */
export interface IFetchVideoComments {
  execute(videoId: string, maxComments?: number): Promise<VideoCommentsResult>
}
