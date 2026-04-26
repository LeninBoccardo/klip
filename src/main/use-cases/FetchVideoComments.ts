import type { IVideoRepository } from '@domain/repositories'
import type { IVideoDownloader } from '@domain/ports'
import type { VideoCommentsResult } from '@shared/types'
import type { IFetchVideoComments } from './IFetchVideoComments'

const DEFAULT_MAX_COMMENTS = 500

/**
 * Fetch YouTube comments + replies for a single video on demand.
 *
 * Unlike FetchVideoDetail, this use case does not persist anything — comments
 * are returned directly to the renderer and held only in TanStack Query
 * mutation state until the user navigates away.
 */
export class FetchVideoComments implements IFetchVideoComments {
  constructor(
    private videoRepo: IVideoRepository,
    private downloader: IVideoDownloader
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

    const { comments, wasTruncated } = await this.downloader.fetchComments(video.url, maxComments)

    return {
      videoId: video.id,
      comments,
      totalFetched: comments.length,
      wasTruncated
    }
  }
}
