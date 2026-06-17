import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import { CommentsTab } from '@/components/features/videos/CommentsTab'
import { useCachedVideoComments, useFetchVideoComments } from '@/hooks/use-videos'
import type { VideoComment, VideoCommentsResult } from '@shared/types'

vi.mock('@/hooks/use-videos', () => ({
  useFetchVideoComments: vi.fn(),
  useCachedVideoComments: vi.fn()
}))

// The thread list is virtualized. jsdom reports zero element heights, so mock
// the virtualizer to control which rows "render". Default (null) → all rows
// visible, so the existing assertions still see every thread. A windowing test
// narrows `visibleIndices` to prove only the reported rows mount.
const visibleIndices = vi.hoisted(() => ({ current: null as number[] | null }))
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => {
    const indices = visibleIndices.current ?? Array.from({ length: count }, (_, i) => i)
    return {
      getTotalSize: () => count * 96,
      getVirtualItems: () =>
        indices
          .filter((i) => i < count)
          .map((i) => ({ index: i, start: i * 96, key: i, size: 96 })),
      measureElement: vi.fn()
    }
  }
}))

type FetchCommentsArgs = { videoId: string; maxComments?: number }
type FetchCommentsState = UseMutationResult<VideoCommentsResult, Error, FetchCommentsArgs>
type CachedCommentsState = UseQueryResult<VideoCommentsResult | null, Error>

function makeCacheState(overrides: Partial<CachedCommentsState> = {}): CachedCommentsState {
  return {
    data: null,
    error: null,
    isLoading: false,
    isPending: false,
    isError: false,
    isSuccess: true,
    status: 'success',
    fetchStatus: 'idle',
    refetch: vi.fn(),
    ...overrides
  } as unknown as CachedCommentsState
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

function makeMutationState(overrides: Partial<FetchCommentsState>): FetchCommentsState {
  return {
    data: undefined,
    error: null,
    isPending: false,
    isError: false,
    isIdle: true,
    isSuccess: false,
    status: 'idle',
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    reset: vi.fn(),
    variables: undefined,
    failureCount: 0,
    failureReason: null,
    isPaused: false,
    submittedAt: 0,
    context: undefined,
    ...overrides
  } as unknown as FetchCommentsState
}

beforeEach(() => {
  vi.clearAllMocks()
  visibleIndices.current = null
  // Cache lookup defaults to "no cached payload" so every existing test
  // continues to exercise the mutation-only flow it was written for.
  // Cases that want a cache hit override this per-test.
  vi.mocked(useCachedVideoComments).mockReturnValue(makeCacheState())
})

describe('CommentsTab — idle state', () => {
  it('renders the load button with no count phrase when knownCount is null', () => {
    vi.mocked(useFetchVideoComments).mockReturnValue(makeMutationState({}))

    render(<CommentsTab videoId="v1" knownCount={null} />)

    expect(screen.getByText('No comments loaded')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /load comments/i })).toBeInTheDocument()
    expect(screen.queryByText(/this video has/i)).not.toBeInTheDocument()
  })

  it('renders the count phrase when knownCount is provided', () => {
    vi.mocked(useFetchVideoComments).mockReturnValue(makeMutationState({}))

    render(<CommentsTab videoId="v1" knownCount={1234} />)

    expect(screen.getByText(/this video has/i)).toBeInTheDocument()
    expect(screen.getByText(/1\.2K comments/i)).toBeInTheDocument()
  })

  it('calls mutate with the videoId and initial cap when the load button is clicked', async () => {
    const mutate = vi.fn()
    vi.mocked(useFetchVideoComments).mockReturnValue(makeMutationState({ mutate }))

    const user = userEvent.setup()
    render(<CommentsTab videoId="v1" knownCount={null} />)

    await user.click(screen.getByRole('button', { name: /load comments/i }))
    expect(mutate).toHaveBeenCalledWith({ videoId: 'v1', maxComments: 500 })
  })
})

describe('CommentsTab — loading state', () => {
  it('renders the spinner and loading copy', () => {
    vi.mocked(useFetchVideoComments).mockReturnValue(
      makeMutationState({
        isPending: true,
        isIdle: false,
        status: 'pending',
        variables: { videoId: 'v1' }
      })
    )

    render(<CommentsTab videoId="v1" knownCount={null} />)

    expect(screen.getByText(/fetching comments from youtube/i)).toBeInTheDocument()
  })
})

describe('CommentsTab — error state', () => {
  it('renders the error message and a retry button that re-fires mutate', async () => {
    const mutate = vi.fn()
    vi.mocked(useFetchVideoComments).mockReturnValue(
      makeMutationState({
        isError: true,
        isIdle: false,
        status: 'error',
        error: new Error('yt-dlp failed: timed out'),
        mutate
      })
    )

    const user = userEvent.setup()
    render(<CommentsTab videoId="v1" knownCount={null} />)

    expect(screen.getByText('Failed to fetch comments')).toBeInTheDocument()
    expect(screen.getByText('yt-dlp failed: timed out')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(mutate).toHaveBeenCalledWith({ videoId: 'v1', maxComments: 500 })
  })
})

describe('CommentsTab — loaded states', () => {
  function loadedState(comments: VideoComment[], wasTruncated = false): FetchCommentsState {
    const data: VideoCommentsResult = {
      videoId: 'v1',
      comments,
      totalFetched: comments.length,
      wasTruncated,
      fetchedAt: '2026-05-12T00:00:00.000Z',
      fromCache: false
    }
    return makeMutationState({
      data,
      isPending: false,
      isIdle: false,
      isSuccess: true,
      status: 'success'
    })
  }

  it('renders threads grouped by parent and a reply count', () => {
    vi.mocked(useFetchVideoComments).mockReturnValue(
      loadedState([
        makeComment({ id: 'top1', author: 'Alice', text: 'Top comment' }),
        makeComment({ id: 'r1', parentId: 'top1', author: 'Bob', text: 'Reply 1' }),
        makeComment({ id: 'r2', parentId: 'top1', author: 'Carol', text: 'Reply 2' }),
        makeComment({ id: 'top2', author: 'Dan', text: 'Another top' })
      ])
    )

    const { container } = render(<CommentsTab videoId="v1" knownCount={null} />)

    // The header summary is split across siblings (`<span>4</span> comments · <span>2</span> replies`),
    // so assert against the rendered textContent rather than chasing individual nodes.
    const headerText = container.textContent ?? ''
    expect(headerText).toContain('4')
    expect(headerText).toContain('comments')
    expect(headerText).toContain('2')
    expect(headerText).toContain('replies')
    // Top-level texts visible; replies hidden behind collapsible until clicked.
    expect(screen.getByText('Top comment')).toBeInTheDocument()
    expect(screen.getByText('Another top')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /view 2 replies/i })).toBeInTheDocument()
  })

  it('reveals replies when the "View N replies" button is clicked', async () => {
    vi.mocked(useFetchVideoComments).mockReturnValue(
      loadedState([
        makeComment({ id: 'top1', text: 'Top' }),
        makeComment({ id: 'r1', parentId: 'top1', author: 'Bob', text: 'Reply text' })
      ])
    )

    const user = userEvent.setup()
    render(<CommentsTab videoId="v1" knownCount={null} />)

    await user.click(screen.getByRole('button', { name: /view 1 replies/i }))
    expect(screen.getByText('Reply text')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /hide 1 replies/i })).toBeInTheDocument()
  })

  it('shows the "First N only" badge with the actual fetched count when wasTruncated is true', () => {
    vi.mocked(useFetchVideoComments).mockReturnValue(
      loadedState([makeComment({ id: 'top1', text: 'A' })], true)
    )

    render(<CommentsTab videoId="v1" knownCount={null} />)

    // The badge now interpolates `totalFetched` (1 in this fixture) so the
    // label reflects how much was actually scraped, not a hardcoded 500.
    expect(screen.getByText('First 1 only')).toBeInTheDocument()
  })

  it('renders Load more + Fetch all when wasTruncated is true', async () => {
    const mutate = vi.fn()
    const data: VideoCommentsResult = {
      videoId: 'v1',
      comments: [makeComment({ id: 'top1', text: 'A' })],
      totalFetched: 500,
      wasTruncated: true,
      fetchedAt: '2026-05-12T00:00:00.000Z',
      fromCache: false
    }
    vi.mocked(useFetchVideoComments).mockReturnValue(
      makeMutationState({
        data,
        isIdle: false,
        isSuccess: true,
        status: 'success',
        mutate
      })
    )

    const user = userEvent.setup()
    render(<CommentsTab videoId="v1" knownCount={null} />)

    const loadMore = screen.getByRole('button', { name: /load more/i })
    const fetchAll = screen.getByRole('button', { name: /fetch all/i })

    await user.click(loadMore)
    expect(mutate).toHaveBeenCalledWith({ videoId: 'v1', maxComments: 1000 })

    await user.click(fetchAll)
    expect(mutate).toHaveBeenCalledWith({ videoId: 'v1', maxComments: 50_000 })
  })

  it('renders the empty-state when totalFetched is 0', () => {
    vi.mocked(useFetchVideoComments).mockReturnValue(loadedState([]))

    render(<CommentsTab videoId="v1" knownCount={null} />)

    expect(screen.getByText('No comments on this video')).toBeInTheDocument()
  })

  it('hides the "replies" segment when no top-level comment has children', () => {
    vi.mocked(useFetchVideoComments).mockReturnValue(
      loadedState([makeComment({ id: 'top1', text: 'A' }), makeComment({ id: 'top2', text: 'B' })])
    )

    render(<CommentsTab videoId="v1" knownCount={null} />)

    expect(screen.queryByText('replies')).not.toBeInTheDocument()
  })

  it('renders a Pinned badge for pinned comments', () => {
    vi.mocked(useFetchVideoComments).mockReturnValue(
      loadedState([makeComment({ id: 'top1', text: 'Pinned one', isPinned: true })])
    )

    render(<CommentsTab videoId="v1" knownCount={null} />)

    expect(screen.getByText('Pinned')).toBeInTheDocument()
  })

  it('renders cached comments without triggering a fetch when the cache query resolves with data', async () => {
    // Regression for the "comments lost on tab/page change" UX: on
    // mount, useCachedVideoComments returns the prior payload from disk
    // and the tab pops the comments in instantly. The mutation is NOT
    // fired automatically — that would re-pay the yt-dlp round trip we
    // just cached out of.
    const mutate = vi.fn()
    const cached: VideoCommentsResult = {
      videoId: 'v1',
      comments: [makeComment({ id: 'top1', text: 'From cache' })],
      totalFetched: 1,
      wasTruncated: false,
      fetchedAt: '2026-05-12T00:00:00.000Z',
      fromCache: true
    }
    vi.mocked(useCachedVideoComments).mockReturnValue(makeCacheState({ data: cached }))
    vi.mocked(useFetchVideoComments).mockReturnValue(makeMutationState({ mutate }))

    render(<CommentsTab videoId="v1" knownCount={null} />)

    expect(screen.getByText('From cache')).toBeInTheDocument()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('only mounts the threads the virtualizer reports as visible (F04 windowing)', () => {
    // 500 top-level comments; the virtualizer reports just two visible.
    const comments = Array.from({ length: 500 }, (_, i) =>
      makeComment({ id: `top${i}`, text: `Comment ${i}`, parentId: null })
    )
    visibleIndices.current = [0, 1]
    vi.mocked(useFetchVideoComments).mockReturnValue(loadedState(comments))

    render(<CommentsTab videoId="v1" knownCount={null} />)

    expect(screen.getByText('Comment 0')).toBeInTheDocument()
    expect(screen.getByText('Comment 1')).toBeInTheDocument()
    // The other 498 are not in the DOM — the windowing layer is the gate.
    expect(screen.queryByText('Comment 2')).not.toBeInTheDocument()
    expect(screen.queryByText('Comment 499')).not.toBeInTheDocument()
  })

  it('re-fires mutate when Reload is clicked', async () => {
    const mutate = vi.fn()
    const data: VideoCommentsResult = {
      videoId: 'v1',
      comments: [makeComment({ id: 'top1', text: 'A' })],
      totalFetched: 1,
      wasTruncated: false,
      fetchedAt: '2026-05-12T00:00:00.000Z',
      fromCache: false
    }
    vi.mocked(useFetchVideoComments).mockReturnValue(
      makeMutationState({
        data,
        isIdle: false,
        isSuccess: true,
        status: 'success',
        mutate
      })
    )

    const user = userEvent.setup()
    render(<CommentsTab videoId="v1" knownCount={null} />)

    await user.click(screen.getByRole('button', { name: /reload/i }))
    // Reload now passes the initial cap explicitly so a load-more session
    // resets back to the first batch instead of inheriting the elevated
    // count from a previous Fetch all click.
    expect(mutate).toHaveBeenCalledWith({ videoId: 'v1', maxComments: 500 })
  })
})
