import type { EntityStatus } from '../types/entity-status'

/** Renderer-facing representation of a cut */
export interface CutDto {
  id: string
  creatorId: string
  videoId: string | null
  title: string
  tags: string[]
  startTimestamp: number | null
  endTimestamp: number | null
  duration: number | null
  resolution: string | null
  fileSize: number | null
  filePath: string
  thumbnailPath: string | null
  status: EntityStatus
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}
