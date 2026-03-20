import type { Creator } from '@domain/entities'
import type { PaginationParams, PaginatedResult, EntityStatus } from '@domain/types'

export interface ICreatorRepository {
  findAll(): Creator[]
  findAllActive(): Creator[]
  findById(id: string): Creator | null
  findByFolderName(folderName: string): Creator | null
  upsert(creator: Creator): void
  updateStatus(id: string, status: EntityStatus, deletedAt: string | null): void
  delete(id: string): void
  findPaginated(params: PaginationParams): PaginatedResult<Creator>
}
