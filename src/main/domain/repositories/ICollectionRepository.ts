import type { Collection, CollectionItem } from '@domain/entities'
import type { PaginationParams, PaginatedResult } from '@domain/types'

export interface ICollectionRepository {
  // ── Collection-level reads ──
  findAll(): Collection[]
  findById(id: string): Collection | null
  findPaginated(params: PaginationParams): PaginatedResult<Collection>

  // ── Collection-level writes ──
  upsert(collection: Collection): void
  /**
   * See {@link ICreatorRepository.upsertWithPrevious} — same audit-hint
   * semantics so the decorator can skip a redundant `findById`.
   */
  upsertWithPrevious(collection: Collection, previous: Collection | null): void
  delete(id: string): void

  // ── Item-level reads ──
  /**
   * Returns all items in the collection, interleaved across the two join
   * tables and sorted by `position` ascending. Tombstones (items whose
   * underlying video/cut has flipped to `missing`) are included; the caller
   * decides how to render them.
   */
  getItems(collectionId: string): CollectionItem[]
  /**
   * Member counts for several collections at once, as a `Map<collectionId, count>`.
   * Used by list views that only need `itemCount`, avoiding a full getItems()
   * (which materializes every membership row) per collection.
   */
  countItemsByCollection(ids: string[]): Map<string, number>

  // ── Item-level writes ──
  /** Insert a single video at the supplied position (caller computes max+1). */
  addVideo(collectionId: string, videoId: string, position: number, addedAt: string): void
  addCut(collectionId: string, cutId: string, position: number, addedAt: string): void
  removeVideo(collectionId: string, videoId: string): void
  removeCut(collectionId: string, cutId: string): void
  /**
   * Bulk renumber. Caller passes the desired final ordering; repo zeroes
   * positions then writes them back. Caller is responsible for wrapping in a
   * transaction so concurrent reads never observe the intermediate state.
   */
  reorderItems(collectionId: string, items: ReadonlyArray<CollectionItem>): void
}
