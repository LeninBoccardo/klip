import type { Creator } from '@domain/entities'
import type { PaginationParams, PaginatedResult, EntityStatus } from '@domain/types'

export interface ICreatorRepository {
  findAll(): Creator[]
  findAllActive(): Creator[]
  findById(id: string): Creator | null
  findByFolderName(folderName: string): Creator | null
  findByYoutubeChannelId(channelId: string): Creator | null
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
}
