import type { EntityStatus } from '@domain/types'

export interface Creator {
  id: string
  name: string
  profileImagePath: string | null
  status: EntityStatus
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}
