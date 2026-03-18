import type { Video } from '@domain/entities'

export interface IVideoRepository {
  findAll(): Video[]
  findById(id: string): Video | null
  findByCreatorId(creatorId: string): Video[]
  upsert(video: Video): void
  delete(id: string): void
}
