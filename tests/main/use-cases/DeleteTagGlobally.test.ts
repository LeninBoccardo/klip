import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DeleteTagGlobally } from '@use-cases/DeleteTagGlobally'
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

describe('DeleteTagGlobally', () => {
  let videoRepo: IVideoRepository
  let cutRepo: ICutRepository
  let transaction: ITransactionScope
  let notifier: INotifier
  let useCase: DeleteTagGlobally

  beforeEach(() => {
    videoRepo = {
      findAll: vi.fn(),
      findAllActive: vi.fn(),
      findById: vi.fn(),
      findByCreatorId: vi.fn(),
      findByProbeStatus: vi.fn(),
      findNeedingDetail: vi.fn(),
      findByTags: vi.fn().mockReturnValue([]),
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
      findByTags: vi.fn().mockReturnValue([]),
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
    transaction = { run: vi.fn(<T>(fn: () => T) => fn()) }
    notifier = { notify: vi.fn() }
    useCase = new DeleteTagGlobally(videoRepo, cutRepo, transaction, notifier)
  })

  it('throws EmptyOldTagError on empty tag (typed error name preserved across IPC)', () => {
    expect(() => useCase.execute('')).toThrow(expect.objectContaining({ name: 'EmptyOldTagError' }))
  })

  it('removes the tag from every active video that carries it', () => {
    vi.mocked(videoRepo.findByTags).mockReturnValue([
      makeVideo({ id: 'v-1', tags: ['wip', 'live'] }),
      makeVideo({ id: 'v-2', tags: ['wip'] })
    ])

    const result = useCase.execute('wip')

    expect(result.videosUpdated).toBe(2)
    expect(videoRepo.upsertWithPrevious).toHaveBeenCalledTimes(2)
    const calls = vi.mocked(videoRepo.upsertWithPrevious).mock.calls
    expect(calls[0][0].tags).toEqual(['live'])
    expect(calls[1][0].tags).toEqual([])
  })

  it('removes the tag across active cuts as well', () => {
    vi.mocked(cutRepo.findByTags).mockReturnValue([
      makeCut({ id: 'c-1', tags: ['wip', 'fav'] })
    ])

    const result = useCase.execute('wip')

    expect(result.cutsUpdated).toBe(1)
    expect(cutRepo.upsertWithPrevious).toHaveBeenCalledTimes(1)
    expect(vi.mocked(cutRepo.upsertWithPrevious).mock.calls[0][0].tags).toEqual(['fav'])
  })

  it('emits a single db-updated push covering only the touched scopes', () => {
    vi.mocked(videoRepo.findByTags).mockReturnValue([makeVideo({ tags: ['wip'] })])
    vi.mocked(cutRepo.findByTags).mockReturnValue([makeCut({ tags: ['wip'] })])

    useCase.execute('wip')

    expect(notifier.notify).toHaveBeenCalledTimes(1)
    expect(notifier.notify).toHaveBeenCalledWith('db-updated', {
      scope: ['videos', 'cuts']
    })
  })

  it('does not emit db-updated when no rows actually carried the tag', () => {
    useCase.execute('absent')
    expect(notifier.notify).not.toHaveBeenCalled()
  })

  it('runs all writes inside a single transaction', () => {
    vi.mocked(videoRepo.findByTags).mockReturnValue([makeVideo({ tags: ['wip'] })])
    vi.mocked(cutRepo.findByTags).mockReturnValue([makeCut({ tags: ['wip'] })])

    useCase.execute('wip')
    expect(transaction.run).toHaveBeenCalledTimes(1)
  })
})
