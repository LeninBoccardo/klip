import type { CollectionItemDto } from '@shared/dtos'

/**
 * Resolves a collection's ordered items to their full DTOs.
 *
 * Soft-deleted (`status: 'missing'` / `'deleted'`) entities are returned
 * with their last-known DTO so the renderer can show a tombstone with
 * the original title. If the underlying row was hard-deleted (FK CASCADE
 * fires before our resolver runs), `entity` is `null`.
 */
export interface IGetCollectionItems {
  execute(collectionId: string): CollectionItemDto[]
}
