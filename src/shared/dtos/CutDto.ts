import type { EntityStatus } from '../types/entity-status'
import type { ProbeStatus } from '../types/probe-status'

/**
 * Renderer-facing representation of a cut.
 *
 * Does **not** expose `filePath` or `thumbnailPath` — the renderer references
 * media via the entity-keyed `klip-media://cut/<id>/file` scheme and never
 * holds raw filesystem paths. The `hasThumbnail` boolean lets the UI
 * short-circuit broken-image cases.
 */
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
  hasThumbnail: boolean
  probeStatus: ProbeStatus
  status: EntityStatus
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}
