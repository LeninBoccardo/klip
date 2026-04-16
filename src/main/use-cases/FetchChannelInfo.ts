import type { IVideoDownloader } from '@domain/ports'
import type { ICreatorRepository } from '@domain/repositories'
import type { FetchChannelInfoResult } from '@domain/types'
import { slugify } from '@domain/types'
import type { IFetchChannelInfo } from './IFetchChannelInfo'

/**
 * Fetches YouTube channel metadata via yt-dlp and optionally links/enriches
 * an existing Creator entity with the returned channel info.
 *
 * Matching strategy:
 * 1. By youtubeChannelId (exact match — previously linked creator)
 * 2. Fallback: slugify(channelName) → findByFolderName (disk-discovered, not yet linked)
 */
export class FetchChannelInfo implements IFetchChannelInfo {
  constructor(
    private downloader: IVideoDownloader,
    private creatorRepo: ICreatorRepository
  ) {}

  async execute(url: string): Promise<FetchChannelInfoResult> {
    if (!url || url.trim().length === 0) {
      throw new Error('URL is required')
    }

    const channelInfo = await this.downloader.fetchChannelInfo(url.trim())

    // Try to match an existing Creator
    let creator = channelInfo.channelId
      ? this.creatorRepo.findByYoutubeChannelId(channelInfo.channelId)
      : null

    if (!creator && channelInfo.channelName) {
      creator = this.creatorRepo.findByFolderName(slugify(channelInfo.channelName))
    }

    if (creator) {
      this.creatorRepo.upsert({
        ...creator,
        youtubeChannelId: channelInfo.channelId ?? creator.youtubeChannelId,
        youtubeChannelUrl: channelInfo.channelUrl ?? creator.youtubeChannelUrl,
        subscriberCount: channelInfo.subscriberCount ?? creator.subscriberCount,
        avatarUrl: channelInfo.avatarUrl ?? creator.avatarUrl,
        updatedAt: new Date().toISOString()
      })
    }

    return {
      channelInfo,
      creatorId: creator?.id ?? null,
      updated: !!creator
    }
  }
}
