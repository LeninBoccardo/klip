import type { Creator } from '@domain/entities'

export interface ICreatorRepository {
  findAll(): Creator[]
  findById(id: string): Creator | null
  upsert(creator: Creator): void
  delete(id: string): void
}
