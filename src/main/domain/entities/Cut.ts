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
  /**
   * Serialised `EditRecipe` produced by the in-app editor. Null for cuts
   * sideloaded via folder-discovery (the watcher path). Domain treats it
   * opaquely; parsing happens at boundaries (sidecar reader, IPC validator).
   */
  editRecipeJson: string | null
  createdAt: string
  updatedAt: string
}
