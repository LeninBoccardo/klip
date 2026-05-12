import type { ChannelInfo } from './channel-info'

/** Request payload for the RegisterCreator use case (and its IPC channel). */
export interface RegisterCreatorRequest {
  channelInfo: ChannelInfo
  displayName: string
  folderName: string
  notes: string | null
  tags: string[]
}

/** Result returned to the renderer after a successful registration. */
export interface RegisterCreatorResult {
  creatorId: string
}

/**
 * Result of a silent avatar refresh on the creator detail page. `refreshed`
 * is true when the creator's `avatarUrl` was actually updated. Anything else
 * (already had avatar, no channel URL, yt-dlp failed, yt-dlp returned no
 * usable thumbnail) maps to `false` — the renderer doesn't need to
 * distinguish failure modes for a silent background refresh.
 */
export interface RefreshCreatorAvatarResult {
  refreshed: boolean
}
