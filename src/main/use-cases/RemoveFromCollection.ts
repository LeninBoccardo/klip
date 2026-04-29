import type { ICollectionRepository } from '@domain/repositories'
import type { INotifier } from '@domain/ports'
import type { RemoveFromCollectionRequest } from '@shared/types'
import type { IRemoveFromCollection } from './IRemoveFromCollection'

export class RemoveFromCollection implements IRemoveFromCollection {
  constructor(
    private readonly collectionRepo: ICollectionRepository,
    private readonly notifier: INotifier
  ) {}

  execute(request: RemoveFromCollectionRequest): { removed: boolean } {
    const items = this.collectionRepo.getItems(request.collectionId)
    const present = items.some((i) => i.kind === request.kind && i.id === request.id)
    if (!present) return { removed: false }

    if (request.kind === 'video') {
      this.collectionRepo.removeVideo(request.collectionId, request.id)
    } else {
      this.collectionRepo.removeCut(request.collectionId, request.id)
    }

    this.notifier.notify('db-updated', { scope: ['collections'] })
    return { removed: true }
  }
}
