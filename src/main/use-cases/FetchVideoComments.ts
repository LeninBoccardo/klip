import type { IVideoRepository } from '@domain/repositories'
import type { IVideoDownloader } from '@domain/ports'
import type { VideoCommentsResult } from '@shared/types'
import type { IFetchVideoComments } from './IFetchVideoComments'
import type { ICommentsCache } from '@main/framework-drivers/comments-cache/CommentsCache'

const DEFAULT_MAX_COMMENTS = 500

/**
 * Fetch YouTube comments + replies for a single video on demand.
 *
 * Result is written to the on-disk CommentsCache (7-day TTL) after each
 * successful fetch so re-opens of the Comments tab don't re-pay the
 * yt-dlp round trip. The cache is *not* read here — callers that want a
 * cache-first read use `GetCachedVideoComments` (cheap, no network). This
 * use case always does the network fetch.
 */
export class FetchVideoComments implements IFetchVideoComments {
  constructor(
    private videoRepo: IVideoRepository,
    private downloader: IVideoDownloader,
    private cache: ICommentsCache
  ) {}

  async execute(
    videoId: string,
    maxComments: number = DEFAULT_MAX_COMMENTS
  ): Promise<VideoCommentsResult> {
    const video = this.videoRepo.findById(videoId)
    if (!video) {
      throw new Error(`Video not found: ${videoId}`)
    }
    if (!video.url) {
      throw new Error(`Video has no URL — cannot fetch comments: ${videoId}`)
    }

    let fetched: { comments: VideoCommentsResult['comments']; wasTruncated: boolean }
    try {
      fetched = await this.downloader.fetchComments(video.url, maxComments)
    } catch (err) {
      // A manual refresh failed (HTTP 429, network drop, etc.). Drop the stale
      // on-disk payload so the next GetCachedVideoComments doesn't keep serving
      // comments the user just tried — and failed — to refresh. This is the
      // documented purpose of cache.invalidate(); without this call it was dead.
      this.cache.invalidate(videoId)
      throw err
    }
    const { comments, wasTruncated } = fetched

    const result: VideoCommentsResult = {
      videoId: video.id,
      comments,
      totalFetched: comments.length,
      wasTruncated,
      fetchedAt: new Date().toISOString(),
      fromCache: false
    }
    this.cache.write(result)
    return result
  }
}
