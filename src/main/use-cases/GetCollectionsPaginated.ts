import type { ICollectionRepository } from '@domain/repositories'
import type { CollectionDto } from '@shared/dtos'
import type { PaginationParams, PaginatedResult } from '@shared/types'
import type { Collection, CollectionKind } from '@domain/entities'
import type { IGetCollectionsPaginated } from './IGetCollectionsPaginated'

export class GetCollectionsPaginated implements IGetCollectionsPaginated {
  constructor(private readonly collectionRepo: ICollectionRepository) {}

  execute(params: PaginationParams): PaginatedResult<CollectionDto> {
    const page = this.collectionRepo.findPaginated(params)
    return {
      ...page,
      data: page.data.map((c) => this.toDto(c))
    }
  }

  private toDto(c: Collection): CollectionDto {
    const items = this.collectionRepo.getItems(c.id)
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      kind: c.kind as CollectionKind,
      itemCount: items.length,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    }
  }
}
