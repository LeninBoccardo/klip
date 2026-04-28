import type { EntityStatus } from '../types/entity-status'

/**
 * Renderer-facing representation of a creator.
 *
 * Does **not** expose `profileImagePath` — the renderer references the local
 * avatar via `klip-media://creator/<id>/avatar` and never holds raw
 * filesystem paths. `hasLocalAvatar` is the boolean check; `avatarUrl` (a
 * remote HTTPS URL from yt-dlp channel metadata) is kept as the fallback for
 * creators without a local profile image.
 */
export interface CreatorDto {
  id: string
  folderName: string
  name: string
  hasLocalAvatar: boolean
  youtubeChannelId: string | null
  youtubeChannelUrl: string | null
  subscriberCount: number | null
  avatarUrl: string | null
  status: EntityStatus
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}
