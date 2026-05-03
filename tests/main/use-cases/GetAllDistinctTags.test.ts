import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GetAllDistinctTags } from '@use-cases/GetAllDistinctTags'
import type { IVideoRepository, ICutRepository } from '@domain/repositories'

describe('GetAllDistinctTags', () => {
  let videoRepo: IVideoRepository
  let cutRepo: ICutRepository
  let useCase: GetAllDistinctTags

  beforeEach(() => {
    videoRepo = {
      findAll: vi.fn(),
      findAllActive: vi.fn(),
      findById: vi.fn(),
      findByCreatorId: vi.fn(),
      findByProbeStatus: vi.fn(),
      findNeedingDetail: vi.fn(),
      findMissingForRecovery: vi.fn().mockReturnValue([]),
      findByTags: vi.fn(),
      getAllDistinctTags: vi.fn().mockReturnValue([]),
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
      getAllDistinctTags: vi.fn().mockReturnValue([]),
      findByProbeStatus: vi.fn(),
      findPaginated: vi.fn(),
      upsert: vi.fn(),
      upsertWithPrevious: vi.fn(),
      updateStatus: vi.fn(),
      updateProbeStatus: vi.fn(),
      delete: vi.fn(),
      updateFilePathPrefix: vi.fn()
    }
    useCase = new GetAllDistinctTags(videoRepo, cutRepo)
  })

  it('returns an empty array when neither table has tagged active rows', () => {
    expect(useCase.execute()).toEqual([])
  })

  it('merges per-table counts into a single aggregation row per tag', () => {
    vi.mocked(videoRepo.getAllDistinctTags).mockReturnValue([
      { tag: 'music', count: 3 },
      { tag: 'live', count: 1 }
    ])
    vi.mocked(cutRepo.getAllDistinctTags).mockReturnValue([
      { tag: 'music', count: 2 },
      { tag: 'funny', count: 4 }
    ])

    const result = useCase.execute()

    const byTag = Object.fromEntries(result.map((r) => [r.tag, r]))
    expect(byTag.music).toEqual({ tag: 'music', videoCount: 3, cutCount: 2 })
    expect(byTag.live).toEqual({ tag: 'live', videoCount: 1, cutCount: 0 })
    expect(byTag.funny).toEqual({ tag: 'funny', videoCount: 0, cutCount: 4 })
  })

  it('sorts by total count desc, then by tag asc on ties', () => {
    vi.mocked(videoRepo.getAllDistinctTags).mockReturnValue([
      { tag: 'b', count: 1 },
      { tag: 'a', count: 1 }
    ])
    vi.mocked(cutRepo.getAllDistinctTags).mockReturnValue([
      { tag: 'top', count: 5 },
      { tag: 'b', count: 2 }
    ])

    const tags = useCase.execute().map((t) => t.tag)
    // top=5, b=3, a=1
    expect(tags).toEqual(['top', 'b', 'a'])
  })
})
