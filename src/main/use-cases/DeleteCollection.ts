import type { ICollectionRepository } from '@domain/repositories'
import type { INotifier } from '@domain/ports'
import type { IDeleteCollection } from './IDeleteCollection'

export class DeleteCollection implements IDeleteCollection {
  constructor(
    private readonly collectionRepo: ICollectionRepository,
    private readonly notifier: INotifier
  ) {}

  execute(id: string): { deleted: boolean } {
    const existing = this.collectionRepo.findById(id)
    if (!existing) return { deleted: false }

    this.collectionRepo.delete(id)
    this.notifier.notify('db-updated', { scope: ['collections'] })
    return { deleted: true }
  }
}
