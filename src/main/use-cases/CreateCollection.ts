import type { ICollectionRepository } from '@domain/repositories'
import type { IIdGenerator, INotifier } from '@domain/ports'
import type { Collection } from '@domain/entities'
import type { CreateCollectionRequest } from '@shared/types'
import type { ICreateCollection } from './ICreateCollection'

export class CreateCollection implements ICreateCollection {
  constructor(
    private readonly collectionRepo: ICollectionRepository,
    private readonly idGenerator: IIdGenerator,
    private readonly notifier: INotifier
  ) {}

  execute(request: CreateCollectionRequest): Collection {
    const trimmed = request.name.trim()
    if (trimmed.length === 0) {
      throw new Error('CreateCollection: name must be non-empty')
    }

    const now = new Date().toISOString()
    const collection: Collection = {
      id: this.idGenerator.generate(),
      name: trimmed,
      description: request.description?.trim() || null,
      kind: 'manual',
      smartQuery: null,
      createdAt: now,
      updatedAt: now
    }

    this.collectionRepo.upsertWithPrevious(collection, null)
    this.notifier.notify('db-updated', { scope: ['collections'] })

    return collection
  }
}
