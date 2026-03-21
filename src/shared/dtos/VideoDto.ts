import type { EntityStatus } from '../types/entity-status'
import type { ProbeStatus } from '../types/probe-status'

/** Renderer-facing representation of a video */
export interface VideoDto {
  id: string
  creatorId: string
  title: string
  url: string | null
  duration: number | null
  resolution: string | null
  fileSize: number | null
  filePath: string
  thumbnailPath: string | null
  downloadDate: string | null
  probeStatus: ProbeStatus
  status: EntityStatus
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}
