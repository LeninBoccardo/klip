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
