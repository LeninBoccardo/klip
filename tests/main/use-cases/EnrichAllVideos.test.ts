import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EnrichAllVideos } from '@use-cases/EnrichAllVideos'
import type { IVideoRepository } from '@domain/repositories'
import type { IDownloadQueue, INotifier } from '@domain/ports'
import type { IFetchVideoDetail } from '@use-cases/IFetchVideoDetail'
import type { Video } from '@domain/entities'

function makeVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: 'v-1',
    creatorId: 'c-1',
    title: 't',
    url: 'https://youtube.com/watch?v=abc',
    duration: 100,
    resolution: '1920x1080',
    fileSize: 1000,
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

describe('EnrichAllVideos', () => {
  let videoRepo: IVideoRepository
  let fetchDetail: IFetchVideoDetail
  let queue: IDownloadQueue
  let notifier: INotifier
  let useCase: EnrichAllVideos

  beforeEach(() => {
    videoRepo = {
      findAll: vi.fn(),
      findAllActive: vi.fn(),
      findById: vi.fn(),
      findByCreatorId: vi.fn(),
      findByProbeStatus: vi.fn(),
      findNeedingDetail: vi.fn().mockReturnValue([]),
      findPaginated: vi.fn(),
      upsert: vi.fn(),
      updateStatus: vi.fn(),
      updateProbeStatus: vi.fn(),
      delete: vi.fn(),
      updateFilePathPrefix: vi.fn()
    }
    fetchDetail = { execute: vi.fn() }
    // Pass-through queue: just await the task
    queue = {
      enqueue: vi.fn(<T>(task: () => Promise<T>) => task()),
      pending: vi.fn().mockReturnValue(0),
      running: vi.fn().mockReturnValue(0),
      onIdle: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn()
    }
    notifier = { notify: vi.fn() }
    useCase = new EnrichAllVideos(videoRepo, fetchDetail, queue, notifier)
  })

  it('returns zero counts when no candidates exist', async () => {
    const result = await useCase.execute()
    expect(result).toEqual({ total: 0, enriched: 0, failed: 0, skipped: 0 })
    expect(fetchDetail.execute).not.toHaveBeenCalled()
    expect(notifier.notify).toHaveBeenCalledWith('db-updated')
  })

  it('enriches all candidates and counts successes', async () => {
    vi.mocked(videoRepo.findNeedingDetail).mockReturnValue([
      makeVideo({ id: 'v-1' }),
      makeVideo({ id: 'v-2' })
    ])
    vi.mocked(fetchDetail.execute).mockResolvedValue({
      videoId: 'v',
      likeCount: null,
      dislikeCount: null,
      commentCount: null,
      viewCount: null,
      category: null,
      tags: [],
      uploadDate: null,
      description: null,
      isShort: false,
      hasTranscript: false,
      transcriptPath: null,
      transcriptText: null
    })

    const result = await useCase.execute()
    expect(result).toEqual({ total: 2, enriched: 2, failed: 0, skipped: 0 })
    expect(fetchDetail.execute).toHaveBeenCalledTimes(2)
    expect(queue.enqueue).toHaveBeenCalledTimes(2)
  })

  it('skips videos with no URL', async () => {
    vi.mocked(videoRepo.findNeedingDetail).mockReturnValue([makeVideo({ id: 'no-url', url: null })])

    const result = await useCase.execute()
    expect(result).toEqual({ total: 1, enriched: 0, failed: 0, skipped: 1 })
    expect(fetchDetail.execute).not.toHaveBeenCalled()
  })

  it('counts failures and continues with the rest', async () => {
    vi.mocked(videoRepo.findNeedingDetail).mockReturnValue([
      makeVideo({ id: 'v-1' }),
      makeVideo({ id: 'v-2' }),
      makeVideo({ id: 'v-3' })
    ])
    vi.mocked(fetchDetail.execute)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({} as never)

    const result = await useCase.execute()
    expect(result).toEqual({ total: 3, enriched: 2, failed: 1, skipped: 0 })
  })
})
