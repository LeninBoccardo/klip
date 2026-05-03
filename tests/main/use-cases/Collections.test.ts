import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CreateCollection } from '@use-cases/CreateCollection'
import { RenameCollection } from '@use-cases/RenameCollection'
import { DeleteCollection } from '@use-cases/DeleteCollection'
import { AddToCollection } from '@use-cases/AddToCollection'
import { RemoveFromCollection } from '@use-cases/RemoveFromCollection'
import { ReorderCollection } from '@use-cases/ReorderCollection'
import { GetCollectionItems } from '@use-cases/GetCollectionItems'
import { GetCollectionById } from '@use-cases/GetCollectionById'
import { GetCollectionsPaginated } from '@use-cases/GetCollectionsPaginated'
import type { ICollectionRepository, IVideoRepository, ICutRepository } from '@domain/repositories'
import type { ITransactionScope, INotifier, IIdGenerator } from '@domain/ports'
import type { Collection, Video, Cut } from '@domain/entities'

// ── shared mock factories ──

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

function makeVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: 'v-1',
    creatorId: 'creator-1',
    title: 'Video',
    url: null,
    duration: null,
    resolution: null,
    fileSize: null,
    filePath: '/x/v.mp4',
    thumbnailPath: null,
    downloadDate: null,
    probeStatus: 'complete',
    viewCount: null,
    likeCount: null,
    dislikeCount: null,
    commentCount: null,
    category: null,
    tags: [],
    uploadDate: null,
    description: null,
    isShort: false,
    transcriptPath: null,
    detailFetchedAt: null,
    status: 'active',
    deletedAt: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides
  }
}

function makeCut(overrides: Partial<Cut> = {}): Cut {
  return {
    id: 'cut-1',
    creatorId: 'creator-1',
    videoId: null,
    title: 'Cut',
    tags: [],
    startTimestamp: null,
    endTimestamp: null,
    duration: null,
    resolution: null,
    fileSize: null,
    filePath: '/x/c.mp4',
    thumbnailPath: null,
    probeStatus: 'complete',
    status: 'active',
    deletedAt: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides
  }
}

function makeRepo(): ICollectionRepository {
  return {
    findAll: vi.fn().mockReturnValue([]),
    findById: vi.fn().mockReturnValue(null),
    findPaginated: vi
      .fn()
      .mockReturnValue({ data: [], total: 0, page: 1, pageSize: 10, totalPages: 0 }),
    upsert: vi.fn(),
    upsertWithPrevious: vi.fn(),
    delete: vi.fn(),
    getItems: vi.fn().mockReturnValue([]),
    addVideo: vi.fn(),
    addCut: vi.fn(),
    removeVideo: vi.fn(),
    removeCut: vi.fn(),
    reorderItems: vi.fn()
  }
}

function makeVideoRepo(): IVideoRepository {
  return {
    findAll: vi.fn(),
    findAllActive: vi.fn(),
    findById: vi.fn().mockReturnValue(null),
    findByCreatorId: vi.fn(),
    findByProbeStatus: vi.fn(),
    findNeedingDetail: vi.fn(),
    findMissingForRecovery: vi.fn().mockReturnValue([]),
    findByTags: vi.fn(),
    searchByTitle: vi.fn(),
    getAllDistinctTags: vi.fn(),
    findPaginated: vi.fn(),
    upsert: vi.fn(),
    upsertWithPrevious: vi.fn(),
    updateStatus: vi.fn(),
    updateProbeStatus: vi.fn(),
    delete: vi.fn(),
    updateFilePathPrefix: vi.fn()
  }
}

function makeCutRepo(): ICutRepository {
  return {
    findAll: vi.fn(),
    findAllActive: vi.fn(),
    findById: vi.fn().mockReturnValue(null),
    findByCreatorId: vi.fn(),
    findByVideoId: vi.fn(),
    findByTags: vi.fn(),
    searchByTitle: vi.fn(),
    getAllDistinctTags: vi.fn(),
    findByProbeStatus: vi.fn(),
    findPaginated: vi.fn(),
    upsert: vi.fn(),
    upsertWithPrevious: vi.fn(),
    updateStatus: vi.fn(),
    updateProbeStatus: vi.fn(),
    delete: vi.fn(),
    updateFilePathPrefix: vi.fn()
  }
}

const passThroughTx: ITransactionScope = { run: vi.fn(<T>(fn: () => T) => fn()) }
const idGenerator: IIdGenerator = { generate: vi.fn().mockReturnValue('new-id') }

let notifier: INotifier
let collectionRepo: ICollectionRepository
let videoRepo: IVideoRepository
let cutRepo: ICutRepository

beforeEach(() => {
  notifier = { notify: vi.fn() }
  collectionRepo = makeRepo()
  videoRepo = makeVideoRepo()
  cutRepo = makeCutRepo()
  vi.mocked(idGenerator.generate).mockReturnValue('new-id')
  // Reset call history (the tx is module-scoped so counts leak across cases)
  // and re-install the pass-through behaviour.
  vi.mocked(passThroughTx.run).mockReset()
  vi.mocked(passThroughTx.run).mockImplementation((fn) => fn())
})

// ── CreateCollection ──

describe('CreateCollection', () => {
  it('creates a manual collection with a fresh id and trimmed name', () => {
    const useCase = new CreateCollection(collectionRepo, idGenerator, notifier)
    const created = useCase.execute({ name: '  My picks  ', description: 'desc' })

    expect(created.id).toBe('new-id')
    expect(created.name).toBe('My picks')
    expect(created.description).toBe('desc')
    expect(created.kind).toBe('manual')
    expect(collectionRepo.upsertWithPrevious).toHaveBeenCalledWith(created, null)
    expect(notifier.notify).toHaveBeenCalledWith('db-updated', { scope: ['collections'] })
  })

  it('rejects an empty / whitespace name', () => {
    const useCase = new CreateCollection(collectionRepo, idGenerator, notifier)
    expect(() => useCase.execute({ name: '   ' })).toThrow(/non-empty/)
    expect(collectionRepo.upsertWithPrevious).not.toHaveBeenCalled()
  })
})

// ── RenameCollection ──

describe('RenameCollection', () => {
  it('rejects renaming a missing collection', () => {
    const useCase = new RenameCollection(collectionRepo, notifier)
    expect(() => useCase.execute({ id: 'gone', name: 'X' })).toThrow(/no collection/)
  })

  it('rejects an empty name', () => {
    const useCase = new RenameCollection(collectionRepo, notifier)
    expect(() => useCase.execute({ id: 'a', name: '   ' })).toThrow(/non-empty/)
  })

  it('skips writing when name + description are unchanged', () => {
    vi.mocked(collectionRepo.findById).mockReturnValue(makeCollection({ id: 'a', name: 'A' }))
    const useCase = new RenameCollection(collectionRepo, notifier)

    useCase.execute({ id: 'a', name: 'A', description: null })

    expect(collectionRepo.upsertWithPrevious).not.toHaveBeenCalled()
    expect(notifier.notify).not.toHaveBeenCalled()
  })

  it('writes + notifies when the name changes', () => {
    vi.mocked(collectionRepo.findById).mockReturnValue(makeCollection({ id: 'a', name: 'Old' }))
    const useCase = new RenameCollection(collectionRepo, notifier)

    const result = useCase.execute({ id: 'a', name: 'New' })

    expect(result.name).toBe('New')
    expect(collectionRepo.upsertWithPrevious).toHaveBeenCalledTimes(1)
    expect(notifier.notify).toHaveBeenCalledWith('db-updated', { scope: ['collections'] })
  })
})

// ── DeleteCollection ──

describe('DeleteCollection', () => {
  it('returns deleted=false when the id does not exist (no notify)', () => {
    const useCase = new DeleteCollection(collectionRepo, notifier)
    const result = useCase.execute('gone')

    expect(result).toEqual({ deleted: false })
    expect(collectionRepo.delete).not.toHaveBeenCalled()
    expect(notifier.notify).not.toHaveBeenCalled()
  })

  it('deletes + notifies when the id exists', () => {
    vi.mocked(collectionRepo.findById).mockReturnValue(makeCollection({ id: 'a' }))
    const useCase = new DeleteCollection(collectionRepo, notifier)

    const result = useCase.execute('a')

    expect(result).toEqual({ deleted: true })
    expect(collectionRepo.delete).toHaveBeenCalledWith('a')
    expect(notifier.notify).toHaveBeenCalledWith('db-updated', { scope: ['collections'] })
  })
})

// ── AddToCollection ──

describe('AddToCollection', () => {
  it('rejects unknown collection id', () => {
    const useCase = new AddToCollection(collectionRepo, videoRepo, cutRepo, passThroughTx, notifier)
    expect(() => useCase.execute({ collectionId: 'gone', kind: 'video', id: 'v-1' })).toThrow(
      /no collection/
    )
  })

  it('rejects unknown video / cut id', () => {
    vi.mocked(collectionRepo.findById).mockReturnValue(makeCollection({ id: 'col' }))
    const useCase = new AddToCollection(collectionRepo, videoRepo, cutRepo, passThroughTx, notifier)

    expect(() => useCase.execute({ collectionId: 'col', kind: 'video', id: 'gone' })).toThrow(
      /no video/
    )
    expect(() => useCase.execute({ collectionId: 'col', kind: 'cut', id: 'gone' })).toThrow(
      /no cut/
    )
  })

  it('appends a video at max(union)+1 and notifies', () => {
    vi.mocked(collectionRepo.findById).mockReturnValue(makeCollection({ id: 'col' }))
    vi.mocked(videoRepo.findById).mockReturnValue(makeVideo({ id: 'v-2' }))
    vi.mocked(collectionRepo.getItems).mockReturnValue([
      { kind: 'video', id: 'v-1', position: 0, addedAt: '' },
      { kind: 'cut', id: 'cut-1', position: 1, addedAt: '' }
    ])
    const useCase = new AddToCollection(collectionRepo, videoRepo, cutRepo, passThroughTx, notifier)

    const result = useCase.execute({ collectionId: 'col', kind: 'video', id: 'v-2' })

    expect(result.position).toBe(2)
    expect(collectionRepo.addVideo).toHaveBeenCalledWith('col', 'v-2', 2, expect.any(String))
    expect(notifier.notify).toHaveBeenCalledWith('db-updated', { scope: ['collections'] })
  })

  it('starts at position 0 for an empty collection', () => {
    vi.mocked(collectionRepo.findById).mockReturnValue(makeCollection({ id: 'col' }))
    vi.mocked(videoRepo.findById).mockReturnValue(makeVideo({ id: 'v-1' }))
    vi.mocked(collectionRepo.getItems).mockReturnValue([])
    const useCase = new AddToCollection(collectionRepo, videoRepo, cutRepo, passThroughTx, notifier)

    const result = useCase.execute({ collectionId: 'col', kind: 'video', id: 'v-1' })
    expect(result.position).toBe(0)
  })

  it('is idempotent — re-adding an existing item returns its current position without writing', () => {
    vi.mocked(collectionRepo.findById).mockReturnValue(makeCollection({ id: 'col' }))
    vi.mocked(videoRepo.findById).mockReturnValue(makeVideo({ id: 'v-1' }))
    vi.mocked(collectionRepo.getItems).mockReturnValue([
      { kind: 'video', id: 'v-1', position: 7, addedAt: '' }
    ])
    const useCase = new AddToCollection(collectionRepo, videoRepo, cutRepo, passThroughTx, notifier)

    const result = useCase.execute({ collectionId: 'col', kind: 'video', id: 'v-1' })
    expect(result.position).toBe(7)
    expect(collectionRepo.addVideo).not.toHaveBeenCalled()
    expect(notifier.notify).not.toHaveBeenCalled()
  })

  it('runs the lookup + insert inside a single transaction', () => {
    vi.mocked(collectionRepo.findById).mockReturnValue(makeCollection({ id: 'col' }))
    vi.mocked(videoRepo.findById).mockReturnValue(makeVideo({ id: 'v-1' }))
    const useCase = new AddToCollection(collectionRepo, videoRepo, cutRepo, passThroughTx, notifier)

    useCase.execute({ collectionId: 'col', kind: 'video', id: 'v-1' })
    expect(passThroughTx.run).toHaveBeenCalledTimes(1)
  })
})

// ── RemoveFromCollection ──

describe('RemoveFromCollection', () => {
  it('returns removed=false when the item is not in the collection (no notify)', () => {
    vi.mocked(collectionRepo.getItems).mockReturnValue([])
    const useCase = new RemoveFromCollection(collectionRepo, notifier)

    const result = useCase.execute({ collectionId: 'col', kind: 'video', id: 'v-1' })
    expect(result).toEqual({ removed: false })
    expect(collectionRepo.removeVideo).not.toHaveBeenCalled()
    expect(notifier.notify).not.toHaveBeenCalled()
  })

  it('removes a video and notifies', () => {
    vi.mocked(collectionRepo.getItems).mockReturnValue([
      { kind: 'video', id: 'v-1', position: 0, addedAt: '' }
    ])
    const useCase = new RemoveFromCollection(collectionRepo, notifier)

    const result = useCase.execute({ collectionId: 'col', kind: 'video', id: 'v-1' })
    expect(result).toEqual({ removed: true })
    expect(collectionRepo.removeVideo).toHaveBeenCalledWith('col', 'v-1')
    expect(notifier.notify).toHaveBeenCalledWith('db-updated', { scope: ['collections'] })
  })

  it('removes a cut via the cut path', () => {
    vi.mocked(collectionRepo.getItems).mockReturnValue([
      { kind: 'cut', id: 'cut-1', position: 0, addedAt: '' }
    ])
    const useCase = new RemoveFromCollection(collectionRepo, notifier)

    useCase.execute({ collectionId: 'col', kind: 'cut', id: 'cut-1' })
    expect(collectionRepo.removeCut).toHaveBeenCalledWith('col', 'cut-1')
  })
})

// ── ReorderCollection ──

describe('ReorderCollection', () => {
  it('returns reordered=0 for an empty items array (no notify)', () => {
    const useCase = new ReorderCollection(collectionRepo, passThroughTx, notifier)
    const result = useCase.execute({ collectionId: 'col', items: [] })

    expect(result).toEqual({ reordered: 0 })
    expect(collectionRepo.reorderItems).not.toHaveBeenCalled()
    expect(notifier.notify).not.toHaveBeenCalled()
  })

  it('rejects mismatched item counts', () => {
    vi.mocked(collectionRepo.getItems).mockReturnValue([
      { kind: 'video', id: 'v-1', position: 0, addedAt: '' },
      { kind: 'video', id: 'v-2', position: 1, addedAt: '' }
    ])
    const useCase = new ReorderCollection(collectionRepo, passThroughTx, notifier)

    expect(() =>
      useCase.execute({ collectionId: 'col', items: [{ kind: 'video', id: 'v-1' }] })
    ).toThrow(/mismatch/)
  })

  it('rejects when the request introduces an unknown item', () => {
    vi.mocked(collectionRepo.getItems).mockReturnValue([
      { kind: 'video', id: 'v-1', position: 0, addedAt: '' }
    ])
    const useCase = new ReorderCollection(collectionRepo, passThroughTx, notifier)

    expect(() =>
      useCase.execute({
        collectionId: 'col',
        items: [{ kind: 'video', id: 'unknown' }]
      })
    ).toThrow(/missing/)
  })

  it('renumbers densely starting at 0 in the supplied order', () => {
    vi.mocked(collectionRepo.getItems).mockReturnValue([
      { kind: 'video', id: 'v-1', position: 0, addedAt: '2025-02-01' },
      { kind: 'cut', id: 'cut-1', position: 1, addedAt: '2025-02-02' },
      { kind: 'video', id: 'v-2', position: 2, addedAt: '2025-02-03' }
    ])
    const useCase = new ReorderCollection(collectionRepo, passThroughTx, notifier)

    const result = useCase.execute({
      collectionId: 'col',
      items: [
        { kind: 'video', id: 'v-2' },
        { kind: 'video', id: 'v-1' },
        { kind: 'cut', id: 'cut-1' }
      ]
    })

    expect(result).toEqual({ reordered: 3 })
    const renumbered = vi.mocked(collectionRepo.reorderItems).mock.calls[0][1]
    expect(renumbered.map((r) => `${r.kind}:${r.id}:${r.position}`)).toEqual([
      'video:v-2:0',
      'video:v-1:1',
      'cut:cut-1:2'
    ])
    // addedAt preserved from original — reorder doesn't reset that.
    expect(renumbered[0].addedAt).toBe('2025-02-03')
    expect(notifier.notify).toHaveBeenCalledWith('db-updated', { scope: ['collections'] })
  })

  it('runs renumber inside a single transaction', () => {
    vi.mocked(collectionRepo.getItems).mockReturnValue([
      { kind: 'video', id: 'v-1', position: 0, addedAt: '' }
    ])
    const useCase = new ReorderCollection(collectionRepo, passThroughTx, notifier)

    useCase.execute({ collectionId: 'col', items: [{ kind: 'video', id: 'v-1' }] })
    expect(passThroughTx.run).toHaveBeenCalledTimes(1)
  })
})

// ── GetCollectionItems (the tombstone case is the critical path) ──

describe('GetCollectionItems', () => {
  it('embeds full DTOs for present videos and cuts', () => {
    vi.mocked(collectionRepo.getItems).mockReturnValue([
      { kind: 'video', id: 'v-1', position: 0, addedAt: '2025-02-01' },
      { kind: 'cut', id: 'cut-1', position: 1, addedAt: '2025-02-01' }
    ])
    vi.mocked(videoRepo.findById).mockReturnValue(makeVideo({ id: 'v-1', title: 'V' }))
    vi.mocked(cutRepo.findById).mockReturnValue(makeCut({ id: 'cut-1', title: 'C' }))

    const useCase = new GetCollectionItems(collectionRepo, videoRepo, cutRepo)
    const items = useCase.execute('col')

    expect(items).toHaveLength(2)
    expect(items[0].entity?.title).toBe('V')
    expect(items[1].entity?.title).toBe('C')
  })

  it('returns entity=null when the underlying row was hard-deleted (FK cascade race)', () => {
    vi.mocked(collectionRepo.getItems).mockReturnValue([
      { kind: 'video', id: 'gone', position: 0, addedAt: '' }
    ])
    vi.mocked(videoRepo.findById).mockReturnValue(null)

    const useCase = new GetCollectionItems(collectionRepo, videoRepo, cutRepo)
    const [item] = useCase.execute('col')

    expect(item.kind).toBe('video')
    expect(item.entity).toBeNull()
  })

  it('preserves the missing entity DTO so the renderer can render a tombstone', () => {
    vi.mocked(collectionRepo.getItems).mockReturnValue([
      { kind: 'video', id: 'v-missing', position: 0, addedAt: '' }
    ])
    vi.mocked(videoRepo.findById).mockReturnValue(
      makeVideo({ id: 'v-missing', title: 'Lost', status: 'missing' })
    )

    const useCase = new GetCollectionItems(collectionRepo, videoRepo, cutRepo)
    const [item] = useCase.execute('col')

    expect(item.entity?.title).toBe('Lost')
    expect(item.entity?.status).toBe('missing')
  })
})

// ── GetCollectionById + GetCollectionsPaginated ──

describe('GetCollectionById', () => {
  it('returns null for an unknown id', () => {
    const useCase = new GetCollectionById(collectionRepo)
    expect(useCase.execute('gone')).toBeNull()
  })

  it('attaches itemCount based on getItems()', () => {
    vi.mocked(collectionRepo.findById).mockReturnValue(makeCollection({ id: 'a', name: 'A' }))
    vi.mocked(collectionRepo.getItems).mockReturnValue([
      { kind: 'video', id: 'v-1', position: 0, addedAt: '' },
      { kind: 'cut', id: 'cut-1', position: 1, addedAt: '' }
    ])

    const useCase = new GetCollectionById(collectionRepo)
    const dto = useCase.execute('a')

    expect(dto?.itemCount).toBe(2)
    expect(dto?.name).toBe('A')
  })
})

describe('GetCollectionsPaginated', () => {
  it('maps each row through with itemCount from getItems', () => {
    const a = makeCollection({ id: 'a', name: 'A' })
    const b = makeCollection({ id: 'b', name: 'B' })
    vi.mocked(collectionRepo.findPaginated).mockReturnValue({
      data: [a, b],
      total: 2,
      page: 1,
      pageSize: 10,
      totalPages: 1
    })
    vi.mocked(collectionRepo.getItems).mockImplementation((id: string) => {
      if (id === 'a') return [{ kind: 'video', id: 'v-1', position: 0, addedAt: '' }]
      return []
    })

    const useCase = new GetCollectionsPaginated(collectionRepo)
    const page = useCase.execute({ page: 1, pageSize: 10 })

    expect(page.data).toHaveLength(2)
    expect(page.data[0].itemCount).toBe(1)
    expect(page.data[1].itemCount).toBe(0)
  })
})
