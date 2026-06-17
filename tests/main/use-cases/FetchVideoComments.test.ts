import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FetchVideoComments } from '@use-cases/FetchVideoComments'
import type { IVideoRepository } from '@domain/repositories'
import type { IVideoDownloader } from '@domain/ports'
import type { Video } from '@domain/entities'
import type { VideoComment } from '@shared/types'

function makeVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: 'video-1',
    creatorId: 'creator-1',
    title: 'Test',
    url: 'https://youtube.com/watch?v=abc',
    duration: 120,
    resolution: '1920x1080',
    fileSize: 1000,
    filePath: '/root/creator-1/downloads/video-1/video.mp4',
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

function makeComment(overrides: Partial<VideoComment> = {}): VideoComment {
  return {
    id: 'c1',
    text: 'Great video!',
    author: 'Alice',
    authorId: 'UC_alice',
    likeCount: 5,
    isPinned: false,
    parentId: null,
    timestamp: 1_700_000_000,
    ...overrides
  }
}

function makeMocks(): {
  videoRepo: IVideoRepository
  downloader: IVideoDownloader
  cache: {
    read: ReturnType<typeof vi.fn>
    write: ReturnType<typeof vi.fn>
    invalidate: ReturnType<typeof vi.fn>
  }
} {
  const videoRepo: IVideoRepository = {
    findAll: vi.fn(),
    findAllActive: vi.fn(),
    findById: vi.fn(),
    findByCreatorId: vi.fn(),
    findByProbeStatus: vi.fn(),
    findNeedingDetail: vi.fn().mockReturnValue([]),
    findMissingForRecovery: vi.fn().mockReturnValue([]),
    findPaginated: vi.fn(),
    upsert: vi.fn(),
    updateStatus: vi.fn(),
    updateProbeStatus: vi.fn(),
    delete: vi.fn(),
    updateFilePathPrefix: vi.fn()
  }
  const downloader = {
    fetchInfo: vi.fn(),
    fetchChannelInfo: vi.fn(),
    fetchVideoDetail: vi.fn(),
    fetchTranscript: vi.fn(),
    fetchComments: vi.fn(),
    download: vi.fn(),
    cancel: vi.fn()
  } as unknown as IVideoDownloader
  const cache = { read: vi.fn(), write: vi.fn(), invalidate: vi.fn() }
  return { videoRepo, downloader, cache }
}

describe('FetchVideoComments', () => {
  let mocks: ReturnType<typeof makeMocks>
  let useCase: FetchVideoComments

  beforeEach(() => {
    mocks = makeMocks()
    useCase = new FetchVideoComments(mocks.videoRepo, mocks.downloader, mocks.cache)
  })

  it('throws when the video id does not exist', async () => {
    vi.mocked(mocks.videoRepo.findById).mockReturnValue(null)
    await expect(useCase.execute('missing')).rejects.toThrow('Video not found')
  })

  it('throws when the video has no URL', async () => {
    vi.mocked(mocks.videoRepo.findById).mockReturnValue(makeVideo({ url: null }))
    await expect(useCase.execute('video-1')).rejects.toThrow('no URL')
  })

  it('returns the downloader result wrapped in a VideoCommentsResult', async () => {
    const comments: VideoComment[] = [
      makeComment({ id: 'top', isPinned: true }),
      makeComment({ id: 'reply', parentId: 'top', author: 'Bob' })
    ]
    vi.mocked(mocks.videoRepo.findById).mockReturnValue(makeVideo())
    vi.mocked(mocks.downloader.fetchComments).mockResolvedValue({
      comments,
      wasTruncated: false
    })

    const result = await useCase.execute('video-1', 200)

    expect(result.videoId).toBe('video-1')
    expect(result.comments).toEqual(comments)
    expect(result.totalFetched).toBe(2)
    expect(result.wasTruncated).toBe(false)
    expect(mocks.downloader.fetchComments).toHaveBeenCalledWith(
      'https://youtube.com/watch?v=abc',
      200
    )
  })

  it('passes the truncation flag through', async () => {
    vi.mocked(mocks.videoRepo.findById).mockReturnValue(makeVideo())
    vi.mocked(mocks.downloader.fetchComments).mockResolvedValue({
      comments: Array.from({ length: 500 }, (_, i) => makeComment({ id: `c${i}` })),
      wasTruncated: true
    })

    const result = await useCase.execute('video-1', 500)

    expect(result.totalFetched).toBe(500)
    expect(result.wasTruncated).toBe(true)
  })

  it('defaults maxComments to 500 when not provided', async () => {
    vi.mocked(mocks.videoRepo.findById).mockReturnValue(makeVideo())
    vi.mocked(mocks.downloader.fetchComments).mockResolvedValue({
      comments: [],
      wasTruncated: false
    })

    await useCase.execute('video-1')

    expect(mocks.downloader.fetchComments).toHaveBeenCalledWith(
      'https://youtube.com/watch?v=abc',
      500
    )
  })

  it('does not persist anything to the video repo', async () => {
    vi.mocked(mocks.videoRepo.findById).mockReturnValue(makeVideo())
    vi.mocked(mocks.downloader.fetchComments).mockResolvedValue({
      comments: [makeComment()],
      wasTruncated: false
    })

    await useCase.execute('video-1')

    expect(mocks.videoRepo.upsert).not.toHaveBeenCalled()
    expect(mocks.videoRepo.updateStatus).not.toHaveBeenCalled()
    expect(mocks.videoRepo.updateProbeStatus).not.toHaveBeenCalled()
  })

  it('writes the result to the comments cache after a successful fetch', async () => {
    // Persistence to disk is what fixes the "comments lost on tab/page
    // change" UX — re-opens of the Comments tab read from the cache
    // (see GetCachedVideoComments) instead of paying another yt-dlp
    // round trip. Asserting the write here keeps that contract honest.
    vi.mocked(mocks.videoRepo.findById).mockReturnValue(makeVideo())
    vi.mocked(mocks.downloader.fetchComments).mockResolvedValue({
      comments: [makeComment()],
      wasTruncated: false
    })

    const result = await useCase.execute('video-1')

    expect(mocks.cache.write).toHaveBeenCalledTimes(1)
    expect(mocks.cache.write).toHaveBeenCalledWith(result)
    // The result advertises a fresh-fetch (not a cache read) so
    // downstream code can distinguish.
    expect(result.fromCache).toBe(false)
    expect(typeof result.fetchedAt).toBe('string')
  })

  it('does not write to the cache when the downloader throws', async () => {
    // Avoids persisting a partial / error state — a future cache read
    // would otherwise serve garbage.
    vi.mocked(mocks.videoRepo.findById).mockReturnValue(makeVideo())
    vi.mocked(mocks.downloader.fetchComments).mockRejectedValue(new Error('boom'))

    await expect(useCase.execute('video-1')).rejects.toThrow('boom')
    expect(mocks.cache.write).not.toHaveBeenCalled()
  })

  it('invalidates the stale on-disk cache when a refresh fails (F34)', async () => {
    // A failed manual refresh must drop the prior cached payload so the next
    // GetCachedVideoComments doesn't keep serving comments the user just tried
    // to refresh — the documented purpose of cache.invalidate().
    vi.mocked(mocks.videoRepo.findById).mockReturnValue(makeVideo())
    vi.mocked(mocks.downloader.fetchComments).mockRejectedValue(new Error('HTTP 429'))

    await expect(useCase.execute('video-1')).rejects.toThrow('HTTP 429')
    expect(mocks.cache.invalidate).toHaveBeenCalledWith('video-1')
    expect(mocks.cache.write).not.toHaveBeenCalled()
  })

  it('propagates downloader errors (timeout, network) to the caller', async () => {
    vi.mocked(mocks.videoRepo.findById).mockReturnValue(makeVideo())
    vi.mocked(mocks.downloader.fetchComments).mockRejectedValue(
      new Error('yt-dlp comment fetch timed out after 90s')
    )

    await expect(useCase.execute('video-1')).rejects.toThrow('timed out after 90s')
  })
})
