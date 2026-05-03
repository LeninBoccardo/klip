import { describe, it, expect, vi } from 'vitest'
import { GetStorageStats } from '@main/use-cases/GetStorageStats'
import type { ICutRepository, IVideoRepository } from '@domain/repositories'

function makeVideoRepo(sumFileSize: number): Pick<IVideoRepository, 'sumFileSize'> {
  return { sumFileSize: vi.fn().mockReturnValue(sumFileSize) }
}

function makeCutRepo(sumFileSize: number): Pick<ICutRepository, 'sumFileSize'> {
  return { sumFileSize: vi.fn().mockReturnValue(sumFileSize) }
}

describe('GetStorageStats', () => {
  it('returns the sum of video and cut file sizes', () => {
    const useCase = new GetStorageStats(
      makeVideoRepo(2_000) as IVideoRepository,
      makeCutRepo(500) as ICutRepository
    )
    expect(useCase.execute()).toEqual({
      videosBytes: 2_000,
      cutsBytes: 500,
      totalBytes: 2_500
    })
  })

  it('reports zero when both repos are empty', () => {
    const useCase = new GetStorageStats(
      makeVideoRepo(0) as IVideoRepository,
      makeCutRepo(0) as ICutRepository
    )
    expect(useCase.execute()).toEqual({
      videosBytes: 0,
      cutsBytes: 0,
      totalBytes: 0
    })
  })
})
