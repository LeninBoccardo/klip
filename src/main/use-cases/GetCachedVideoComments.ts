import type { VideoCommentsResult } from '@shared/types'
import type { ICommentsCache } from '@main/framework-drivers/comments-cache/CommentsCache'

/**
 * Cache-only sibling to FetchVideoComments. Returns the on-disk cached
 * payload for a video if present and within the cache TTL, else null.
 *
 * Used by the renderer to populate the Comments tab on mount: a cache
 * hit pops the data in instantly without any yt-dlp round trip, and the
 * user only sees the "Load comments" affordance when there's truly
 * nothing on disk. This is what fixes the previous "comments lost on
 * tab/page change" UX.
 */
export interface IGetCachedVideoComments {
  execute(videoId: string): Promise<VideoCommentsResult | null>
}

export class GetCachedVideoComments implements IGetCachedVideoComments {
  constructor(private cache: ICommentsCache) {}

  async execute(videoId: string): Promise<VideoCommentsResult | null> {
    return this.cache.read(videoId)
  }
}
