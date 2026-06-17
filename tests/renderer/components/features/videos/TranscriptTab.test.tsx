import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TranscriptTab } from '@/components/features/videos/TranscriptTab'
import { useTranscript, useTranscriptSegments } from '@/hooks/use-videos'
import type { TranscriptSegment } from '@shared/types'

vi.mock('@/hooks/use-videos', () => ({
  useTranscript: vi.fn(),
  useTranscriptSegments: vi.fn()
}))

// Player store: only `requestSeek` is read, via a selector.
vi.mock('@/hooks/use-player-store', () => ({
  usePlayerStore: (selector: (s: { requestSeek: () => void }) => unknown) =>
    selector({ requestSeek: vi.fn() })
}))

// The segment list is virtualized; jsdom has no layout. Control visible rows
// and spy on scrollToIndex (the windowed replacement for ref.scrollIntoView).
const virtualMock = vi.hoisted(() => ({
  visibleIndices: null as number[] | null,
  scrollToIndex: vi.fn()
}))
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => {
    const indices = virtualMock.visibleIndices ?? Array.from({ length: count }, (_, i) => i)
    return {
      getTotalSize: () => count * 44,
      getVirtualItems: () =>
        indices
          .filter((i) => i < count)
          .map((i) => ({ index: i, start: i * 44, key: i, size: 44 })),
      measureElement: vi.fn(),
      scrollToIndex: virtualMock.scrollToIndex
    }
  }
}))

function makeSegments(texts: string[]): TranscriptSegment[] {
  return texts.map((text, i) => ({ startMs: i * 1000, endMs: i * 1000 + 900, text }))
}

function mockState<T>(data: T, isLoading = false): { data: T; isLoading: boolean } {
  return { data, isLoading }
}

beforeEach(() => {
  vi.clearAllMocks()
  virtualMock.visibleIndices = null
  // Default: no plain-text transcript; segments drive the tests.
  vi.mocked(useTranscript).mockReturnValue(mockState(null) as never)
})

describe('TranscriptTab — virtualized segment list (F16)', () => {
  it('only mounts the segments the virtualizer reports as visible (windowing)', () => {
    const segments = makeSegments(Array.from({ length: 1000 }, (_, i) => `Segment line ${i}`))
    vi.mocked(useTranscriptSegments).mockReturnValue(mockState(segments) as never)
    virtualMock.visibleIndices = [0, 1]

    render(<TranscriptTab videoId="v1" hasTranscript everEnriched durationSeconds={120} />)

    expect(screen.getByText('Segment line 0')).toBeInTheDocument()
    expect(screen.getByText('Segment line 1')).toBeInTheDocument()
    expect(screen.queryByText('Segment line 999')).not.toBeInTheDocument()
  })

  it('scrolls the virtualizer to the matched segment index on search (not a ref)', async () => {
    const segments = makeSegments(['intro', 'middle', 'the needle is here', 'outro'])
    vi.mocked(useTranscriptSegments).mockReturnValue(mockState(segments) as never)

    const user = userEvent.setup()
    render(<TranscriptTab videoId="v1" hasTranscript everEnriched durationSeconds={120} />)

    await user.type(screen.getByRole('searchbox'), 'needle')

    // The match is in segment index 2; the effect must center it via scrollToIndex.
    expect(virtualMock.scrollToIndex).toHaveBeenCalledWith(2, { align: 'center' })
  })
})
