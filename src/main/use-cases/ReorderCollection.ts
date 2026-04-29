import type { ICollectionRepository } from '@domain/repositories'
import type { ITransactionScope, INotifier } from '@domain/ports'
import type { CollectionItem } from '@domain/entities'
import type { ReorderCollectionRequest } from '@shared/types'
import type { IReorderCollection } from './IReorderCollection'

export class ReorderCollection implements IReorderCollection {
  constructor(
    private readonly collectionRepo: ICollectionRepository,
    private readonly transaction: ITransactionScope,
    private readonly notifier: INotifier
  ) {}

  execute(request: ReorderCollectionRequest): { reordered: number } {
    if (request.items.length === 0) return { reordered: 0 }

    let count = 0

    this.transaction.run(() => {
      const current = this.collectionRepo.getItems(request.collectionId)
      const currentKey = (i: { kind: string; id: string }): string => `${i.kind}:${i.id}`

      const currentSet = new Set(current.map(currentKey))
      const requestSet = new Set(request.items.map(currentKey))

      // Reject partial reorders: every existing item must appear in the
      // request, and the request must not introduce items not already in
      // the collection. The use case has no way to invent positions for
      // missing items or auto-add foreign ones.
      if (currentSet.size !== requestSet.size) {
        throw new Error(
          `ReorderCollection: item count mismatch (collection has ${currentSet.size}, request has ${requestSet.size})`
        )
      }
      for (const k of currentSet) {
        if (!requestSet.has(k)) {
          throw new Error(`ReorderCollection: missing item "${k}" in request`)
        }
      }

      const now = new Date().toISOString()
      const renumbered: CollectionItem[] = request.items.map((item, index) => {
        const existing = current.find((c) => c.kind === item.kind && c.id === item.id)
        return {
          kind: item.kind,
          id: item.id,
          position: index,
          addedAt: existing?.addedAt ?? now
        }
      })

      this.collectionRepo.reorderItems(request.collectionId, renumbered)
      count = renumbered.length
    })

    if (count > 0) {
      this.notifier.notify('db-updated', { scope: ['collections'] })
    }
    return { reordered: count }
  }
}
