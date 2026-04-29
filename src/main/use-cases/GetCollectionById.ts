import type { ICollectionRepository } from '@domain/repositories'
import type { CollectionDto } from '@shared/dtos'
import type { CollectionKind } from '@domain/entities'
import type { IGetCollectionById } from './IGetCollectionById'

export class GetCollectionById implements IGetCollectionById {
  constructor(private readonly collectionRepo: ICollectionRepository) {}

  execute(id: string): CollectionDto | null {
    const collection = this.collectionRepo.findById(id)
    if (!collection) return null

    const items = this.collectionRepo.getItems(id)
    return {
      id: collection.id,
      name: collection.name,
      description: collection.description,
      kind: collection.kind as CollectionKind,
      itemCount: items.length,
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt
    }
  }
}
