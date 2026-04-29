import type { ICollectionRepository } from '@domain/repositories'
import type { INotifier } from '@domain/ports'
import type { Collection } from '@domain/entities'
import type { RenameCollectionRequest } from '@shared/types'
import type { IRenameCollection } from './IRenameCollection'

export class RenameCollection implements IRenameCollection {
  constructor(
    private readonly collectionRepo: ICollectionRepository,
    private readonly notifier: INotifier
  ) {}

  execute(request: RenameCollectionRequest): Collection {
    const trimmed = request.name.trim()
    if (trimmed.length === 0) {
      throw new Error('RenameCollection: name must be non-empty')
    }

    const previous = this.collectionRepo.findById(request.id)
    if (!previous) {
      throw new Error(`RenameCollection: no collection with id ${request.id}`)
    }

    // Skip the write entirely when nothing actually changed — keeps the
    // audit log free of no-op `updated` entries when the user opens and
    // closes the rename dialog without editing.
    const nextDescription = request.description?.trim() || null
    if (previous.name === trimmed && previous.description === nextDescription) {
      return previous
    }

    const updated: Collection = {
      ...previous,
      name: trimmed,
      description: nextDescription,
      updatedAt: new Date().toISOString()
    }

    this.collectionRepo.upsertWithPrevious(updated, previous)
    this.notifier.notify('db-updated', { scope: ['collections'] })

    return updated
  }
}
