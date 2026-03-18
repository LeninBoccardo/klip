import type { Cut } from '@domain/entities'

export interface ICutRepository {
  findAll(): Cut[]
  findById(id: string): Cut | null
  findByCreatorId(creatorId: string): Cut[]
  findByVideoId(videoId: string): Cut[]
  findByTags(tags: string[]): Cut[]
  upsert(cut: Cut): void
  delete(id: string): void
}
