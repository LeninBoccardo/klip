import type { EntityStatus } from '../types/entity-status'
import type { ProbeStatus } from '../types/probe-status'
import type { EditRecipe } from '../types/edit-recipe'

/**
 * Renderer-facing representation of a cut.
 *
 * Does **not** expose `filePath` or `thumbnailPath` — the renderer references
 * media via the entity-keyed `klip-media://cut/<id>/file` scheme and never
 * holds raw filesystem paths. The `hasThumbnail` boolean lets the UI
 * short-circuit broken-image cases.
 *
 * `editRecipe` is the parsed recipe for editor-produced cuts (and any
 * sideloaded cut whose `cut-data.json` carried a valid recipe). null for
 * legacy or sideloaded cuts that don't have one. The boundary parses the
 * stored JSON through `editRecipeSchema` so a corrupted DB column surfaces
 * as null instead of crashing the renderer.
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
  editRecipe: EditRecipe | null
  probeStatus: ProbeStatus
  status: EntityStatus
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}
