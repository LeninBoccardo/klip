import type { Video } from '@domain/entities'
import type { PaginationParams, PaginatedResult } from '@domain/types'

export interface VideoQueryParams extends PaginationParams {
  creatorId?: string
}

export interface IVideoRepository {
  findAll(): Video[]
  findById(id: string): Video | null
  findByCreatorId(creatorId: string): Video[]
  upsert(video: Video): void
  delete(id: string): void
  findPaginated(params: VideoQueryParams): PaginatedResult<Video>
}
