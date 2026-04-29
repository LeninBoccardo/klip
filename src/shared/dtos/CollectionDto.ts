import type { CutDto } from './CutDto'
import type { VideoDto } from './VideoDto'

/**
 * Renderer-facing representation of a collection (no items).
 *
 * `kind` is the collection type discriminator: 'manual' for v1; 'smart'
 * is reserved for a future saved-query collection. `itemCount` is
 * computed at the boundary so the list view can display counts without
 * a follow-up `getItems` per row.
 */
export interface CollectionDto {
  id: string
  name: string
  description: string | null
  kind: 'manual' | 'smart'
  itemCount: number
  createdAt: string
  updatedAt: string
}

/**
 * One element in a collection's ordered item list. The kind discriminator
 * tells the renderer which DTO is attached. `entity` is `null` only when
 * the underlying video/cut has been hard-deleted but the join row hasn't
 * been cleaned up yet (FK CASCADE makes this transient); `'missing'`
 * status entities still carry their DTO with `status: 'missing'` so the
 * UI can render a tombstone.
 */
export type CollectionItemDto =
  | { kind: 'video'; position: number; addedAt: string; entity: VideoDto | null }
  | { kind: 'cut'; position: number; addedAt: string; entity: CutDto | null }
