import type { Video } from '@domain/entities'
import type { PaginationParams, PaginatedResult, EntityStatus } from '@domain/types'

export interface VideoQueryParams extends PaginationParams {
  creatorId?: string
}

export interface IVideoRepository {
  findAll(): Video[]
  findAllActive(): Video[]
  findById(id: string): Video | null
  findByCreatorId(creatorId: string): Video[]
  upsert(video: Video): void
  updateStatus(id: string, status: EntityStatus, deletedAt: string | null): void
  delete(id: string): void
  findPaginated(params: VideoQueryParams): PaginatedResult<Video>
}
