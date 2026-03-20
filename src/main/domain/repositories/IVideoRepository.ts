import type { Video } from '@domain/entities'
import type { PaginatedResult, EntityStatus } from '@domain/types'
import type { VideoQueryParams } from '@shared/types'

export type { VideoQueryParams } from '@shared/types'

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
