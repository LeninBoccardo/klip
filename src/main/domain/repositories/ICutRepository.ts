import type { Cut } from '@domain/entities'
import type { PaginationParams, PaginatedResult } from '@domain/types'

export interface CutQueryParams extends PaginationParams {
  creatorId?: string
  videoId?: string
  tags?: string[]
}

export interface ICutRepository {
  findAll(): Cut[]
  findById(id: string): Cut | null
  findByCreatorId(creatorId: string): Cut[]
  findByVideoId(videoId: string): Cut[]
  findByTags(tags: string[]): Cut[]
  upsert(cut: Cut): void
  delete(id: string): void
  findPaginated(params: CutQueryParams): PaginatedResult<Cut>
}
