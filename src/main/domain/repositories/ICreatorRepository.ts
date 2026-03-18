import type { Creator } from '@domain/entities'
import type { PaginationParams, PaginatedResult } from '@domain/types'

export interface ICreatorRepository {
  findAll(): Creator[]
  findById(id: string): Creator | null
  upsert(creator: Creator): void
  delete(id: string): void
  findPaginated(params: PaginationParams): PaginatedResult<Creator>
}
