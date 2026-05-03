import type { Creator } from '@domain/entities'
import type { PaginationParams, PaginatedResult, EntityStatus } from '@domain/types'

export interface ICreatorRepository {
  findAll(): Creator[]
  findAllActive(): Creator[]
  findById(id: string): Creator | null
  findByFolderName(folderName: string): Creator | null
  findByYoutubeChannelId(channelId: string): Creator | null
  /**
   * Active creators whose `name` contains the (case-insensitive) query as a
   * substring. Caller bounds the result via `limit`. Used by the global
   * search palette; the paginated grid uses `findPaginated({ search })`.
   */
  searchByName(query: string, limit: number): Creator[]
  upsert(creator: Creator): void
  /**
   * Same as `upsert`, but the caller passes the prior state of the entity
   * (or `null` if it didn't previously exist). The audited decorator uses
   * this hint to skip the redundant `findById` it would otherwise issue
   * before computing the audit diff. Use this in batch flows (e.g. reconcile)
   * where the caller has just queried the entity in bulk.
   */
  upsertWithPrevious(creator: Creator, previous: Creator | null): void
  updateStatus(id: string, status: EntityStatus, deletedAt: string | null): void
  delete(id: string): void
  findPaginated(params: PaginationParams): PaginatedResult<Creator>
  // ── Aggregates (used by dashboard) ──
  /** Total count of active creators. */
  count(): number
  /** Count of creators grouped by status. Includes only existing buckets. */
  countByStatus(): Partial<Record<EntityStatus, number>>
  /** Look up a batch of creators by id. Returns Map of id → name. */
  findNamesByIds(ids: string[]): Map<string, string>
}
