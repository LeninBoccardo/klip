import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ICreateCollection } from '@use-cases/ICreateCollection'
import type { IRenameCollection } from '@use-cases/IRenameCollection'
import type { IDeleteCollection } from '@use-cases/IDeleteCollection'
import type { IAddToCollection } from '@use-cases/IAddToCollection'
import type { IRemoveFromCollection } from '@use-cases/IRemoveFromCollection'
import type { IReorderCollection } from '@use-cases/IReorderCollection'
import type { IGetCollectionItems } from '@use-cases/IGetCollectionItems'
import type { IGetCollectionById } from '@use-cases/IGetCollectionById'
import type { IGetCollectionsPaginated } from '@use-cases/IGetCollectionsPaginated'
import type { Collection } from '@domain/entities'

const electron = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
  return {
    handlers,
    ipcMain: {
      handle: vi.fn((channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
        handlers.set(channel, handler)
      }),
      on: vi.fn()
    }
  }
})

vi.mock('electron', () => ({ ipcMain: electron.ipcMain }))

import { registerCollectionController } from '@main/interface-adapters/controllers/CollectionController'

function makeCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: 'col-1',
    name: 'Favourites',
    description: null,
    kind: 'manual',
    smartQuery: null,
    createdAt: '2025-02-01T00:00:00.000Z',
    updatedAt: '2025-02-01T00:00:00.000Z',
    ...overrides
  }
}

function makeUseCases(): {
  create: ICreateCollection
  rename: IRenameCollection
  delete: IDeleteCollection
  addItem: IAddToCollection
  removeItem: IRemoveFromCollection
  reorder: IReorderCollection
  getItems: IGetCollectionItems
  getById: IGetCollectionById
  getPaginated: IGetCollectionsPaginated
} {
  return {
    create: { execute: vi.fn().mockReturnValue(makeCollection({ id: 'new' })) },
    rename: { execute: vi.fn().mockReturnValue(makeCollection({ id: 'a', name: 'New' })) },
    delete: { execute: vi.fn().mockReturnValue({ deleted: true }) },
    addItem: { execute: vi.fn().mockReturnValue({ position: 3 }) },
    removeItem: { execute: vi.fn().mockReturnValue({ removed: true }) },
    reorder: { execute: vi.fn().mockReturnValue({ reordered: 4 }) },
    getItems: { execute: vi.fn().mockReturnValue([]) },
    getById: { execute: vi.fn().mockReturnValue(null) },
    getPaginated: {
      execute: vi.fn().mockReturnValue({ data: [], total: 0, page: 1, pageSize: 10, totalPages: 0 })
    }
  }
}

async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = electron.handlers.get(channel)
  if (!handler) throw new Error(`No handler for "${channel}"`)
  return (await handler({}, ...args)) as T
}

describe('CollectionController', () => {
  beforeEach(() => {
    electron.handlers.clear()
    electron.ipcMain.handle.mockClear()
  })

  it('registers all nine collection channels', () => {
    registerCollectionController(makeUseCases())
    expect([...electron.handlers.keys()].sort()).toEqual(
      [
        'collection-add-item',
        'collection-by-id',
        'collection-create',
        'collection-delete',
        'collection-get-items',
        'collection-remove-item',
        'collection-rename',
        'collection-reorder',
        'collections-paginated'
      ].sort()
    )
  })

  it('"collection-create" maps the entity to a DTO with itemCount=0', async () => {
    const u = makeUseCases()
    vi.mocked(u.create.execute).mockReturnValue(makeCollection({ id: 'new', name: 'X' }))
    registerCollectionController(u)

    const dto = await invoke<{ id: string; name: string; itemCount: number }>('collection-create', {
      name: 'X'
    })

    expect(u.create.execute).toHaveBeenCalledWith({ name: 'X' })
    expect(dto.id).toBe('new')
    expect(dto.itemCount).toBe(0)
  })

  it('"collection-rename" delegates and re-fetches the DTO via getById', async () => {
    const u = makeUseCases()
    vi.mocked(u.rename.execute).mockReturnValue(makeCollection({ id: 'a', name: 'Renamed' }))
    vi.mocked(u.getById.execute).mockReturnValue({
      id: 'a',
      name: 'Renamed',
      description: null,
      kind: 'manual',
      itemCount: 7,
      createdAt: '',
      updatedAt: ''
    })
    registerCollectionController(u)

    const dto = await invoke<{ name: string; itemCount: number }>('collection-rename', {
      id: 'a',
      name: 'Renamed'
    })
    expect(dto.itemCount).toBe(7)
    expect(u.rename.execute).toHaveBeenCalledWith({ id: 'a', name: 'Renamed' })
  })

  it('"collection-delete" / add / remove / reorder forward their payloads verbatim', async () => {
    const u = makeUseCases()
    registerCollectionController(u)

    await invoke('collection-delete', 'a')
    expect(u.delete.execute).toHaveBeenCalledWith('a')

    const addReq = { collectionId: 'col', kind: 'video' as const, id: 'v-1' }
    await invoke('collection-add-item', addReq)
    expect(u.addItem.execute).toHaveBeenCalledWith(addReq)

    const removeReq = { collectionId: 'col', kind: 'cut' as const, id: 'cut-1' }
    await invoke('collection-remove-item', removeReq)
    expect(u.removeItem.execute).toHaveBeenCalledWith(removeReq)

    const reorderReq = {
      collectionId: 'col',
      items: [{ kind: 'video' as const, id: 'v-1' }]
    }
    await invoke('collection-reorder', reorderReq)
    expect(u.reorder.execute).toHaveBeenCalledWith(reorderReq)
  })

  it('"collection-get-items" delegates with the id', async () => {
    const u = makeUseCases()
    vi.mocked(u.getItems.execute).mockReturnValue([
      { kind: 'video', position: 0, addedAt: '', entity: null }
    ])
    registerCollectionController(u)

    const result = await invoke<unknown[]>('collection-get-items', 'col')
    expect(result).toHaveLength(1)
    expect(u.getItems.execute).toHaveBeenCalledWith('col')
  })

  it('"collections-paginated" delegates the params object', async () => {
    const u = makeUseCases()
    registerCollectionController(u)

    const params = { page: 2, pageSize: 25 }
    await invoke('collections-paginated', params)
    expect(u.getPaginated.execute).toHaveBeenCalledWith(params)
  })
})
