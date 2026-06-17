import type { ICollectionRepository } from '@domain/repositories'
import type { CollectionDto } from '@shared/dtos'
import type { PaginationParams, PaginatedResult } from '@shared/types'
import type { Collection, CollectionKind } from '@domain/entities'
import type { IGetCollectionsPaginated } from './IGetCollectionsPaginated'

export class GetCollectionsPaginated implements IGetCollectionsPaginated {
  constructor(private readonly collectionRepo: ICollectionRepository) {}

  execute(params: PaginationParams): PaginatedResult<CollectionDto> {
    const page = this.collectionRepo.findPaginated(params)
    // Prefetch member counts for the whole page in two grouped COUNTs, rather
    // than a getItems() per collection that materialized every membership row
    // just to read .length. (F44)
    const counts = this.collectionRepo.countItemsByCollection(page.data.map((c) => c.id))
    return {
      ...page,
      data: page.data.map((c) => this.toDto(c, counts.get(c.id) ?? 0))
    }
  }

  private toDto(c: Collection, itemCount: number): CollectionDto {
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      kind: c.kind as CollectionKind,
      itemCount,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    }
  }
}
