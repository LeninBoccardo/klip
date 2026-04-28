import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BulkUpdateTags } from '@use-cases/BulkUpdateTags'
import type { IVideoRepository, ICutRepository } from '@domain/repositories'
import type { ITransactionScope, INotifier } from '@domain/ports'
import type { Video, Cut } from '@domain/entities'

function makeVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: 'v-1',
    creatorId: 'c-1',
    title: 't',
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
    id: 'c-1',
    creatorId: 'cr-1',
    videoId: null,
    title: 't',
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

describe('BulkUpdateTags', () => {
  let videoRepo: IVideoRepository
  let cutRepo: ICutRepository
  let transaction: ITransactionScope
  let notifier: INotifier
  let useCase: BulkUpdateTags

  beforeEach(() => {
    videoRepo = {
      findAll: vi.fn(),
      findAllActive: vi.fn(),
      findById: vi.fn(),
      findByCreatorId: vi.fn(),
      findByProbeStatus: vi.fn(),
      findNeedingDetail: vi.fn(),
      findByTags: vi.fn(),
      getAllDistinctTags: vi.fn(),
      findPaginated: vi.fn(),
      upsert: vi.fn(),
      upsertWithPrevious: vi.fn(),
      updateStatus: vi.fn(),
      updateProbeStatus: vi.fn(),
      delete: vi.fn(),
      updateFilePathPrefix: vi.fn()
    }
    cutRepo = {
      findAll: vi.fn(),
      findAllActive: vi.fn(),
      findById: vi.fn(),
      findByCreatorId: vi.fn(),
      findByVideoId: vi.fn(),
      findByTags: vi.fn(),
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
    // Pass-through transaction so the test can observe the inner writes.
    transaction = { run: vi.fn(<T>(fn: () => T) => fn()) }
    notifier = { notify: vi.fn() }
    useCase = new BulkUpdateTags(videoRepo, cutRepo, transaction, notifier)
  })

  it('returns zero counts when ids array is empty', () => {
    const result = useCase.execute({ entityKind: 'video', ids: [], addTags: ['x'] })
    expect(result).toEqual({ updated: 0, skipped: 0 })
    expect(notifier.notify).not.toHaveBeenCalled()
    expect(transaction.run).not.toHaveBeenCalled()
  })

  it('throws when both addTags and removeTags are empty', () => {
    expect(() => useCase.execute({ entityKind: 'video', ids: ['v-1'] })).toThrow(/at least one/)
  })

  it('runs all per-id work inside a single transaction', () => {
    vi.mocked(videoRepo.findById).mockReturnValue(makeVideo({ id: 'v-1', tags: [] }))

    useCase.execute({ entityKind: 'video', ids: ['v-1'], addTags: ['music'] })

    expect(transaction.run).toHaveBeenCalledTimes(1)
  })

  it('adds tags by union and dedupes against existing tags', () => {
    vi.mocked(videoRepo.findById).mockReturnValue(makeVideo({ tags: ['music'] }))

    const result = useCase.execute({
      entityKind: 'video',
      ids: ['v-1'],
      addTags: ['music', 'live']
    })

    expect(result).toEqual({ updated: 1, skipped: 0 })
    expect(videoRepo.upsertWithPrevious).toHaveBeenCalledTimes(1)
    const [updated] = vi.mocked(videoRepo.upsertWithPrevious).mock.calls[0]
    expect(updated.tags).toEqual(['music', 'live'])
  })

  it('removes tags from the existing list', () => {
    vi.mocked(videoRepo.findById).mockReturnValue(makeVideo({ tags: ['music', 'live', 'concert'] }))

    const result = useCase.execute({
      entityKind: 'video',
      ids: ['v-1'],
      removeTags: ['live']
    })

    expect(result).toEqual({ updated: 1, skipped: 0 })
    const [updated] = vi.mocked(videoRepo.upsertWithPrevious).mock.calls[0]
    expect(updated.tags).toEqual(['music', 'concert'])
  })

  it('treats removeTags as the higher precedence when a tag appears in both add and remove', () => {
    // current=['music', 'live']: addTags=['live'] (already there) AND
    // removeTags=['live'] → 'live' is dropped, 'music' stays.
    vi.mocked(videoRepo.findById).mockReturnValue(makeVideo({ tags: ['music', 'live'] }))

    useCase.execute({
      entityKind: 'video',
      ids: ['v-1'],
      addTags: ['live'],
      removeTags: ['live']
    })

    const [updated] = vi.mocked(videoRepo.upsertWithPrevious).mock.calls[0]
    expect(updated.tags).toEqual(['music'])
  })

  it('skips ids that no longer exist in the repo', () => {
    vi.mocked(videoRepo.findById).mockImplementation((id: string) =>
      id === 'v-1' ? makeVideo({ id: 'v-1' }) : null
    )

    const result = useCase.execute({
      entityKind: 'video',
      ids: ['v-1', 'gone'],
      addTags: ['music']
    })

    expect(result).toEqual({ updated: 1, skipped: 1 })
    expect(videoRepo.upsertWithPrevious).toHaveBeenCalledTimes(1)
  })

  it('skips an entity when the resulting tag set equals the current set', () => {
    // Adding a tag the entity already has → no-op.
    vi.mocked(videoRepo.findById).mockReturnValue(makeVideo({ tags: ['music'] }))

    const result = useCase.execute({
      entityKind: 'video',
      ids: ['v-1'],
      addTags: ['music']
    })

    expect(result).toEqual({ updated: 0, skipped: 1 })
    expect(videoRepo.upsertWithPrevious).not.toHaveBeenCalled()
  })

  it('emits exactly one db-updated push regardless of batch size', () => {
    vi.mocked(videoRepo.findById).mockImplementation((id) => makeVideo({ id, tags: [] }))

    const ids = ['v-1', 'v-2', 'v-3', 'v-4', 'v-5']
    useCase.execute({ entityKind: 'video', ids, addTags: ['music'] })

    expect(notifier.notify).toHaveBeenCalledTimes(1)
    expect(notifier.notify).toHaveBeenCalledWith('db-updated', { scope: ['videos'] })
  })

  it('does not emit db-updated when nothing was updated', () => {
    vi.mocked(videoRepo.findById).mockReturnValue(null)

    useCase.execute({ entityKind: 'video', ids: ['gone'], addTags: ['music'] })

    expect(notifier.notify).not.toHaveBeenCalled()
  })

  it('routes cut entityKind to the cut repo and emits cuts scope', () => {
    vi.mocked(cutRepo.findById).mockReturnValue(makeCut({ id: 'c-1', tags: [] }))

    useCase.execute({ entityKind: 'cut', ids: ['c-1'], addTags: ['funny'] })

    expect(cutRepo.upsertWithPrevious).toHaveBeenCalledTimes(1)
    expect(videoRepo.upsertWithPrevious).not.toHaveBeenCalled()
    expect(notifier.notify).toHaveBeenCalledWith('db-updated', { scope: ['cuts'] })
  })
})
