import type { ICollectionRepository, IVideoRepository, ICutRepository } from '@domain/repositories'
import type { ITransactionScope, INotifier } from '@domain/ports'
import type { AddToCollectionRequest, AddToCollectionResult } from '@shared/types'
import type { IAddToCollection } from './IAddToCollection'

export class AddToCollection implements IAddToCollection {
  constructor(
    private readonly collectionRepo: ICollectionRepository,
    private readonly videoRepo: IVideoRepository,
    private readonly cutRepo: ICutRepository,
    private readonly transaction: ITransactionScope,
    private readonly notifier: INotifier
  ) {}

  execute(request: AddToCollectionRequest): AddToCollectionResult {
    const collection = this.collectionRepo.findById(request.collectionId)
    if (!collection) {
      throw new Error(`AddToCollection: no collection with id ${request.collectionId}`)
    }

    // Validate the entity exists. Soft-deleted (status='deleted'/'missing')
    // entities are still addable — the user might be reorganising and we
    // don't want to block on a transient missing flag.
    if (request.kind === 'video') {
      if (!this.videoRepo.findById(request.id)) {
        throw new Error(`AddToCollection: no video with id ${request.id}`)
      }
    } else {
      if (!this.cutRepo.findById(request.id)) {
        throw new Error(`AddToCollection: no cut with id ${request.id}`)
      }
    }

    let position = 0
    let alreadyAdded = false

    this.transaction.run(() => {
      const items = this.collectionRepo.getItems(request.collectionId)
      const existing = items.find((i) => i.kind === request.kind && i.id === request.id)
      if (existing) {
        alreadyAdded = true
        position = existing.position
        return
      }

      const max = items.reduce((acc, item) => (item.position > acc ? item.position : acc), -1)
      position = max + 1
      const addedAt = new Date().toISOString()

      if (request.kind === 'video') {
        this.collectionRepo.addVideo(request.collectionId, request.id, position, addedAt)
      } else {
        this.collectionRepo.addCut(request.collectionId, request.id, position, addedAt)
      }
    })

    if (!alreadyAdded) {
      this.notifier.notify('db-updated', { scope: ['collections'] })
    }
    return { position }
  }
}
