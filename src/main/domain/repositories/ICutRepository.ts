import type { Cut } from '@domain/entities'
import type { PaginatedResult, EntityStatus } from '@domain/types'
import type { CutQueryParams } from '@shared/types'

export type { CutQueryParams } from '@shared/types'

export interface ICutRepository {
  findAll(): Cut[]
  findAllActive(): Cut[]
  findById(id: string): Cut | null
  findByCreatorId(creatorId: string): Cut[]
  findByVideoId(videoId: string): Cut[]
  findByTags(tags: string[]): Cut[]
  upsert(cut: Cut): void
  updateStatus(id: string, status: EntityStatus, deletedAt: string | null): void
  delete(id: string): void
  findPaginated(params: CutQueryParams): PaginatedResult<Cut>
}
