import { describe, it, expect, vi } from 'vitest'
import { GetLibraryStats } from '@main/use-cases/GetLibraryStats'
import type {
  ICreatorRepository,
  ICutRepository,
  IVideoRepository
} from '@domain/repositories'
import type { IGetStorageStats } from '@main/use-cases/IGetStorageStats'
import type { LibraryStats } from '@shared/types'

function makeCreatorRepo(): ICreatorRepository {
  return {
    count: vi.fn().mockReturnValue(7),
    countByStatus: vi.fn().mockReturnValue({ active: 5, missing: 2 }),
    findNamesByIds: vi.fn().mockImplementation((ids: string[]) => {
      return new Map(ids.map((id) => [id, `Creator ${id}`]))
    })
  } as unknown as ICreatorRepository
}

function makeVideoRepo(): IVideoRepository {
  return {
    count: vi.fn().mockReturnValue(42),
    countByStatus: vi.fn().mockReturnValue({ active: 40, deleted: 2 }),
    countTranscribed: vi.fn().mockReturnValue(30),
    sumDuration: vi.fn().mockReturnValue(123_456),
    sumFileSize: vi.fn().mockReturnValue(789_000),
    findDownloadCountsByDay: vi
      .fn()
      .mockReturnValue([{ date: '2026-05-01', count: 3 }]),
    findTopCreators: vi.fn().mockReturnValue([
      { creatorId: 'c-1', videoCount: 10 },
      { creatorId: 'c-2', videoCount: 5 }
    ])
  } as unknown as IVideoRepository
}

function makeCutRepo(): ICutRepository {
  return {
    count: vi.fn().mockReturnValue(8),
    sumDuration: vi.fn().mockReturnValue(900),
    sumFileSize: vi.fn().mockReturnValue(50_000)
  } as unknown as ICutRepository
}

function makeStorageStats(): IGetStorageStats {
  return {
    execute: vi.fn().mockReturnValue({
      videosBytes: 789_000,
      cutsBytes: 50_000,
      totalBytes: 839_000
    })
  }
}

describe('GetLibraryStats', () => {
  it('bundles all aggregates into a single snapshot', () => {
    const useCase = new GetLibraryStats(
      makeCreatorRepo(),
      makeVideoRepo(),
      makeCutRepo(),
      makeStorageStats()
    )
    const result: LibraryStats = useCase.execute()

    expect(result.creators).toEqual({
      total: 7,
      byStatus: { active: 5, missing: 2 }
    })
    expect(result.videos).toEqual({
      total: 42,
      byStatus: { active: 40, deleted: 2 },
      transcribed: 30,
      totalDuration: 123_456,
      totalSize: 789_000
    })
    expect(result.cuts).toEqual({
      total: 8,
      totalDuration: 900,
      totalSize: 50_000
    })
    expect(result.downloadsByDay).toEqual([{ date: '2026-05-01', count: 3 }])
    expect(result.topCreators).toEqual([
      { creatorId: 'c-1', name: 'Creator c-1', videoCount: 10 },
      { creatorId: 'c-2', name: 'Creator c-2', videoCount: 5 }
    ])
    expect(result.storage.totalBytes).toBe(839_000)
  })

  it('falls back to creatorId when the name lookup misses', () => {
    const creatorRepo = makeCreatorRepo()
    vi.mocked(creatorRepo.findNamesByIds).mockReturnValue(new Map())

    const useCase = new GetLibraryStats(
      creatorRepo,
      makeVideoRepo(),
      makeCutRepo(),
      makeStorageStats()
    )
    const result = useCase.execute()
    expect(result.topCreators[0].name).toBe('c-1')
  })
})
