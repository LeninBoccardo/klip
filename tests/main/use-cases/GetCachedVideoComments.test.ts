import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GetCachedVideoComments } from '@use-cases/GetCachedVideoComments'
import type { ICommentsCache } from '@main/framework-drivers/comments-cache/CommentsCache'
import type { VideoComment, VideoCommentsResult } from '@shared/types'

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

function makeResult(overrides: Partial<VideoCommentsResult> = {}): VideoCommentsResult {
  return {
    videoId: 'video-1',
    comments: [makeComment()],
    totalFetched: 1,
    wasTruncated: false,
    fetchedAt: '2025-01-01T00:00:00.000Z',
    fromCache: true,
    ...overrides
  }
}

function makeCache(): {
  read: ReturnType<typeof vi.fn>
  write: ReturnType<typeof vi.fn>
  invalidate: ReturnType<typeof vi.fn>
} {
  return { read: vi.fn(), write: vi.fn(), invalidate: vi.fn() }
}

describe('GetCachedVideoComments', () => {
  let cache: ReturnType<typeof makeCache>
  let useCase: GetCachedVideoComments

  beforeEach(() => {
    cache = makeCache()
    useCase = new GetCachedVideoComments(cache as unknown as ICommentsCache)
  })

  it('returns the cached payload on a cache hit', async () => {
    const cached = makeResult({
      comments: [
        makeComment({ id: 'top', isPinned: true }),
        makeComment({ id: 'reply', parentId: 'top', author: 'Bob' })
      ],
      totalFetched: 2
    })
    cache.read.mockReturnValue(cached)

    const result = await useCase.execute('video-1')

    expect(result).toBe(cached)
    expect(result?.fromCache).toBe(true)
    expect(result?.comments).toHaveLength(2)
  })

  it('forwards the videoId to the cache verbatim', async () => {
    cache.read.mockReturnValue(makeResult())

    await useCase.execute('abc-123_XYZ')

    expect(cache.read).toHaveBeenCalledTimes(1)
    expect(cache.read).toHaveBeenCalledWith('abc-123_XYZ')
  })

  it('returns null on a cache miss', async () => {
    cache.read.mockReturnValue(null)

    const result = await useCase.execute('missing')

    expect(result).toBeNull()
    expect(cache.read).toHaveBeenCalledWith('missing')
  })

  it('passes an empty-string videoId straight through to the cache', async () => {
    // The use case does no validation of its own — that is the cache's job.
    cache.read.mockReturnValue(null)

    const result = await useCase.execute('')

    expect(result).toBeNull()
    expect(cache.read).toHaveBeenCalledWith('')
  })

  it('does not write to or invalidate the cache (read-only use case)', async () => {
    cache.read.mockReturnValue(makeResult())

    await useCase.execute('video-1')

    expect(cache.write).not.toHaveBeenCalled()
    expect(cache.invalidate).not.toHaveBeenCalled()
  })

  it('resolves to a promise even though the cache read is synchronous', async () => {
    cache.read.mockReturnValue(makeResult())

    const pending = useCase.execute('video-1')

    expect(pending).toBeInstanceOf(Promise)
    await expect(pending).resolves.toMatchObject({ videoId: 'video-1' })
  })

  it('propagates an error thrown by the cache read', async () => {
    cache.read.mockImplementation(() => {
      throw new Error('disk exploded')
    })

    await expect(useCase.execute('video-1')).rejects.toThrow('disk exploded')
  })
})
