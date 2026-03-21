import type { EntityStatus, ProbeStatus } from '@domain/types'

export interface Cut {
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
  probeStatus: ProbeStatus
  status: EntityStatus
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}
