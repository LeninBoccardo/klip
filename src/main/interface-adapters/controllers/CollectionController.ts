import type { ICreateCollection } from '@use-cases/ICreateCollection'
import type { IRenameCollection } from '@use-cases/IRenameCollection'
import type { IDeleteCollection } from '@use-cases/IDeleteCollection'
import type { IAddToCollection } from '@use-cases/IAddToCollection'
import type { IRemoveFromCollection } from '@use-cases/IRemoveFromCollection'
import type { IReorderCollection } from '@use-cases/IReorderCollection'
import type { IGetCollectionItems } from '@use-cases/IGetCollectionItems'
import type { IGetCollectionById } from '@use-cases/IGetCollectionById'
import type { IGetCollectionsPaginated } from '@use-cases/IGetCollectionsPaginated'
import type { CollectionKind } from '@domain/entities'
import type { CollectionDto } from '@shared/dtos'
import type { Collection } from '@domain/entities'
import { createTypedHandler } from './create-typed-handler'

interface CollectionUseCases {
  create: ICreateCollection
  rename: IRenameCollection
  delete: IDeleteCollection
  addItem: IAddToCollection
  removeItem: IRemoveFromCollection
  reorder: IReorderCollection
  getItems: IGetCollectionItems
  getById: IGetCollectionById
  getPaginated: IGetCollectionsPaginated
}

/**
 * IPC controller for collections (manual playlists of videos + cuts).
 *
 * Registers the full collection surface — paginated list, detail-by-id,
 * item resolution, plus the six mutation channels. Mutations return the
 * fresh DTO (or a small status object) so the renderer can update its
 * cache directly without a follow-up read; the `db-updated` push fired
 * by each use case still runs to invalidate any other subscribers.
 */
export function registerCollectionController(useCases: CollectionUseCases): void {
  createTypedHandler('collections-paginated', async (_event, params) => {
    return useCases.getPaginated.execute(params)
  })

  createTypedHandler('collection-by-id', async (_event, id) => {
    return useCases.getById.execute(id)
  })

  createTypedHandler('collection-get-items', async (_event, collectionId) => {
    return useCases.getItems.execute(collectionId)
  })

  createTypedHandler('collection-create', async (_event, request) => {
    const created = useCases.create.execute(request)
    return collectionToDto(created, 0)
  })

  createTypedHandler('collection-rename', async (_event, request) => {
    const updated = useCases.rename.execute(request)
    // Re-fetch via the paginated/by-id mapping path so the response carries
    // the same itemCount the renderer would see on next refresh.
    const dto = useCases.getById.execute(updated.id)
    return dto ?? collectionToDto(updated, 0)
  })

  createTypedHandler('collection-delete', async (_event, id) => {
    return useCases.delete.execute(id)
  })

  createTypedHandler('collection-add-item', async (_event, request) => {
    return useCases.addItem.execute(request)
  })

  createTypedHandler('collection-remove-item', async (_event, request) => {
    return useCases.removeItem.execute(request)
  })

  createTypedHandler('collection-reorder', async (_event, request) => {
    return useCases.reorder.execute(request)
  })
}

function collectionToDto(c: Collection, itemCount: number): CollectionDto {
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
