import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// jsdom doesn't implement Element.prototype.scrollIntoView. cmdk calls it
// when it auto-selects the first matching item, so without this shim every
// CommandDialog mount with results explodes inside the layout effect.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function (): void {
    /* no-op for jsdom */
  }
}
import type { UseQueryResult } from '@tanstack/react-query'
import i18n from '@renderer/i18n'
import { CommandPalette } from '@/components/features/search/CommandPalette'
import { useSearchAll, useSearchTranscripts } from '@/hooks/use-search'
import { useRecentEntities, type RecentEntity } from '@/hooks/use-recent-entities'
import type { SearchAllResult, TranscriptSearchResult } from '@shared/types'

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock
}))

vi.mock('@/hooks/use-search', () => ({
  useSearchAll: vi.fn(),
  useSearchTranscripts: vi.fn()
}))

vi.mock('@/hooks/use-recent-entities', () => ({
  useRecentEntities: vi.fn()
}))

const toastInfo = vi.fn()
vi.mock('sonner', () => ({
  toast: { info: (...args: unknown[]) => toastInfo(...args) }
}))

const tSearch = (key: string, params?: Record<string, unknown>): string =>
  i18n.t(key, { ns: 'search', ...params })

function makeAllResult(overrides: Partial<SearchAllResult> = {}): SearchAllResult {
  return { creators: [], videos: [], cuts: [], tags: [], ...overrides }
}

function makeQueryResult<T>(
  overrides: Partial<UseQueryResult<T, Error>>
): UseQueryResult<T, Error> {
  return {
    data: undefined,
    error: null,
    isFetching: false,
    isLoading: false,
    isError: false,
    isSuccess: false,
    isPending: true,
    status: 'pending',
    refetch: vi.fn(),
    ...overrides
  } as unknown as UseQueryResult<T, Error>
}

const noTranscripts = (): UseQueryResult<TranscriptSearchResult, Error> =>
  makeQueryResult<TranscriptSearchResult>({ data: { hits: [], totalApproximate: 0 } })

const addRecent = vi.fn()
function setupRecents(recents: RecentEntity[] = []): void {
  vi.mocked(useRecentEntities).mockReturnValue({
    recents,
    addRecent,
    clearRecents: vi.fn()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  navigateMock.mockReset()
  toastInfo.mockReset()
  addRecent.mockReset()
  vi.mocked(useSearchTranscripts).mockReturnValue(noTranscripts())
})

describe('CommandPalette — closed', () => {
  it('renders no palette content when open is false', () => {
    setupRecents([])
    vi.mocked(useSearchAll).mockReturnValue(
      makeQueryResult<SearchAllResult>({ data: makeAllResult() })
    )
    render(<CommandPalette open={false} onOpenChange={() => {}} />)
    // The dialog title is rendered as a hidden visually-hidden node only when
    // the dialog is open. Closed → nothing user-facing in the DOM.
    expect(screen.queryByPlaceholderText(tSearch('placeholder'))).not.toBeInTheDocument()
  })
})

describe('CommandPalette — empty query', () => {
  it('renders the initial empty copy when no recents are stored', () => {
    setupRecents([])
    vi.mocked(useSearchAll).mockReturnValue(
      makeQueryResult<SearchAllResult>({ data: makeAllResult() })
    )

    render(<CommandPalette open onOpenChange={() => {}} />)

    expect(screen.getByText(tSearch('empty.initial'))).toBeInTheDocument()
  })

  it('renders the recents group with their labels when localStorage has entries', () => {
    setupRecents([
      { kind: 'creator', id: 'c-1', label: 'Alice', visitedAt: 1 },
      { kind: 'video', id: 'v-1', label: 'Bob video', visitedAt: 2 }
    ])
    vi.mocked(useSearchAll).mockReturnValue(
      makeQueryResult<SearchAllResult>({ data: makeAllResult() })
    )

    render(<CommandPalette open onOpenChange={() => {}} />)

    expect(screen.getByText(tSearch('groups.recent'))).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob video')).toBeInTheDocument()
    // Initial-empty copy hidden once recents are present.
    expect(screen.queryByText(tSearch('empty.initial'))).not.toBeInTheDocument()
  })
})

describe('CommandPalette — query results', () => {
  it('renders the creators group when search returns creators', async () => {
    setupRecents([])
    vi.mocked(useSearchAll).mockReturnValue(
      makeQueryResult<SearchAllResult>({
        data: makeAllResult({
          creators: [
            { id: 'c-1', name: 'Alice', folderName: 'alice', externalUrl: null, status: 'active' }
          ] as SearchAllResult['creators']
        })
      })
    )

    const user = userEvent.setup()
    render(<CommandPalette open onOpenChange={() => {}} />)

    // Type into the input so `showRecents` flips false and the result groups
    // render. cmdk filters by item `value`, which contains the creator name —
    // typing a substring of that name matches.
    await user.type(screen.getByPlaceholderText(tSearch('placeholder')), 'alice')

    expect(screen.getByText(tSearch('groups.creators'))).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('clicking a tag fires the "filter coming soon" toast and closes', async () => {
    setupRecents([])
    vi.mocked(useSearchAll).mockReturnValue(
      makeQueryResult<SearchAllResult>({
        data: makeAllResult({
          tags: [{ tag: 'music', videoCount: 3, cutCount: 1 }]
        })
      })
    )
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(<CommandPalette open onOpenChange={onOpenChange} />)

    await user.type(screen.getByPlaceholderText(tSearch('placeholder')), 'music')

    // cmdk surfaces the matching item; click it.
    await user.click(screen.getByText('music'))

    expect(toastInfo).toHaveBeenCalledWith(tSearch('tagFilterToast', { tag: 'music' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('clicking a creator result navigates and pushes the entity into recents', async () => {
    setupRecents([])
    vi.mocked(useSearchAll).mockReturnValue(
      makeQueryResult<SearchAllResult>({
        data: makeAllResult({
          creators: [
            { id: 'c-1', name: 'Alice', folderName: 'alice', externalUrl: null, status: 'active' }
          ] as SearchAllResult['creators']
        })
      })
    )
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(<CommandPalette open onOpenChange={onOpenChange} />)

    await user.type(screen.getByPlaceholderText(tSearch('placeholder')), 'alice')
    await user.click(screen.getByText('Alice'))

    expect(addRecent).toHaveBeenCalledWith({ kind: 'creator', id: 'c-1', label: 'Alice' })
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/creators/$creatorId',
      params: { creatorId: 'c-1' }
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('renders the loading spinner copy while a non-empty query is fetching', async () => {
    setupRecents([])
    vi.mocked(useSearchAll).mockReturnValue(makeQueryResult<SearchAllResult>({ isFetching: true }))

    const user = userEvent.setup()
    render(<CommandPalette open onOpenChange={() => {}} />)

    await user.type(screen.getByPlaceholderText(tSearch('placeholder')), 'q')
    expect(screen.getByText(tSearch('loading'))).toBeInTheDocument()
  })

  it('renders the no-results empty copy when both surfaces return empty', async () => {
    setupRecents([])
    vi.mocked(useSearchAll).mockReturnValue(
      makeQueryResult<SearchAllResult>({ data: makeAllResult() })
    )
    vi.mocked(useSearchTranscripts).mockReturnValue(noTranscripts())

    const user = userEvent.setup()
    render(<CommandPalette open onOpenChange={() => {}} />)

    await user.type(screen.getByPlaceholderText(tSearch('placeholder')), 'zzz')

    expect(screen.getByText(tSearch('empty.noResults', { query: 'zzz' }))).toBeInTheDocument()
  })
})

describe('CommandPalette — close', () => {
  it('clears the query input 150ms after open flips to false', () => {
    setupRecents([])
    vi.mocked(useSearchAll).mockReturnValue(
      makeQueryResult<SearchAllResult>({ data: makeAllResult() })
    )

    vi.useFakeTimers()
    try {
      const { rerender } = render(<CommandPalette open onOpenChange={() => {}} />)

      // Set the query directly via the input's onChange so we don't fight
      // userEvent + fake-timer interactions inside cmdk's keystroke flow.
      const input = screen.getByPlaceholderText(tSearch('placeholder'))
      fireEvent.change(input, { target: { value: 'cats' } })
      expect(input).toHaveValue('cats')

      // Close the palette → effect schedules a 150ms reset.
      rerender(<CommandPalette open={false} onOpenChange={() => {}} />)
      act(() => {
        vi.advanceTimersByTime(149)
      })
      // Re-open before the timer fires → the cleanup cancels the reset and
      // the value should still be there.
      rerender(<CommandPalette open onOpenChange={() => {}} />)
      expect(screen.getByPlaceholderText(tSearch('placeholder'))).toHaveValue('cats')

      // Now close and let the full 150ms elapse → query cleared on next open.
      rerender(<CommandPalette open={false} onOpenChange={() => {}} />)
      act(() => {
        vi.advanceTimersByTime(150)
      })
      rerender(<CommandPalette open onOpenChange={() => {}} />)
      expect(screen.getByPlaceholderText(tSearch('placeholder'))).toHaveValue('')
    } finally {
      vi.useRealTimers()
    }
  })
})
