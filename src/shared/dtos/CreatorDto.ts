import type { EntityStatus } from '../types/entity-status'

/** Renderer-facing representation of a creator */
export interface CreatorDto {
  id: string
  folderName: string
  name: string
  profileImagePath: string | null
  status: EntityStatus
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}
