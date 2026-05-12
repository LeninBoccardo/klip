import type { IVideoDownloader, INotifier } from '@domain/ports'
import type { ICreatorRepository } from '@domain/repositories'
import type { IRefreshCreatorAvatar, RefreshCreatorAvatarResult } from './IRefreshCreatorAvatar'

/**
 * Silently fills in a creator's missing `avatarUrl` by re-calling yt-dlp's
 * channel-info endpoint. Triggered on creator-detail page entry; never throws
 * (errors are logged and swallowed because avatars are cosmetic).
 *
 * Skips work when the creator already has a usable avatar source — either a
 * local `profileImagePath` or a remote `avatarUrl`. Also skips when the
 * creator has no `youtubeChannelUrl` (no way to ask yt-dlp).
 *
 * On success, broadcasts a `db-updated` notification so any open creator
 * query picks up the new URL and re-renders the avatar.
 */
export class RefreshCreatorAvatar implements IRefreshCreatorAvatar {
  constructor(
    private downloader: IVideoDownloader,
    private creatorRepo: ICreatorRepository,
    private notifier: INotifier
  ) {}

  async execute(creatorId: string): Promise<RefreshCreatorAvatarResult> {
    const creator = this.creatorRepo.findById(creatorId)
    if (!creator) return { refreshed: false }

    if (creator.profileImagePath !== null) return { refreshed: false }
    if (creator.avatarUrl !== null) return { refreshed: false }

    const url = creator.youtubeChannelUrl
    if (!url) return { refreshed: false }

    try {
      const info = await this.downloader.fetchChannelInfo(url)
      const fetchedAvatarUrl = info.avatarUrl ?? null
      if (fetchedAvatarUrl === null) return { refreshed: false }

      this.creatorRepo.upsert({
        ...creator,
        avatarUrl: fetchedAvatarUrl,
        subscriberCount: info.subscriberCount ?? creator.subscriberCount,
        updatedAt: new Date().toISOString()
      })
      this.notifier.notify('db-updated', { scope: ['creators'] })
      return { refreshed: true }
    } catch (err) {
      console.warn(
        `[RefreshCreatorAvatar] yt-dlp failed for "${creator.folderName}":`,
        err instanceof Error ? err.message : err
      )
      return { refreshed: false }
    }
  }
}
