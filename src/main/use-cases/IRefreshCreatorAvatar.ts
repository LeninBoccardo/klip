import type { RefreshCreatorAvatarResult } from '@shared/types'

export type { RefreshCreatorAvatarResult }

export interface IRefreshCreatorAvatar {
  execute(creatorId: string): Promise<RefreshCreatorAvatarResult>
}
