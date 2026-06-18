import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UseQueryResult, UseMutationResult } from '@tanstack/react-query'
import i18n from '@renderer/i18n'
import { FinishedDownloadsList } from '@/components/features/downloads/FinishedDownloadsList'
import { useDownloadHistory, useRetryDownload } from '@/hooks/use-download-history'
import { useDateFormat } from '@/hooks/use-date-format'
import type { DownloadHistoryEntryDto } from '@shared/dtos'

// `Link` is the only thing FinishedDownloadsList imports from the router. Render
// it as a plain anchor that surfaces `to` + the resolved `videoId` param so the
// success-path navigation targets are assertable without a real router context.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string
    params?: { videoId?: string }
    children: React.ReactNode
  }) => (
    <a href={to} data-to={to} data-video-id={params?.videoId} {...rest}>
      {children}
    </a>
  )
}))

vi.mock('@/hooks/use-download-history', () => ({
  useDownloadHistory: vi.fn(),
  useRetryDownload: vi.fn()
}))

vi.mock('@/hooks/use-date-format', () => ({
  useDateFormat: vi.fn()
}))

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args)
  }
}))

const t = (key: string, params?: Record<string, unknown>): string =>
  i18n.t(key, { ns: 'downloads', ...params })

const formatDateMock = vi.fn((date: Date | string | null) => `formatted:${String(date)}`)

function setHistory(
  overrides: Partial<UseQueryResult<DownloadHistoryEntryDto[], Error>> = {}
): void {
  vi.mocked(useDownloadHistory).mockReturnValue({
    data: [],
    isLoading: false,
    ...overrides
  } as unknown as UseQueryResult<DownloadHistoryEntryDto[], Error>)
}

function setDateFormat(isLoading = false): void {
  vi.mocked(useDateFormat).mockReturnValue({
    format: 'auto',
    isLoading,
    formatDate: formatDateMock
  } as unknown as ReturnType<typeof useDateFormat>)
}

function setRetry(
  overrides: Partial<UseMutationResult<{ downloadId: string }, Error, string>> = {}
): ReturnType<typeof vi.fn> {
  const mutate = vi.fn()
  vi.mocked(useRetryDownload).mockReturnValue({
    mutate,
    isPending: false,
    ...overrides
  } as unknown as UseMutationResult<{ downloadId: string }, Error, string>)
  return mutate
}

function makeEntry(overrides: Partial<DownloadHistoryEntryDto> = {}): DownloadHistoryEntryDto {
  return {
    id: 'hist-1',
    youtubeUrl: 'https://youtu.be/abc',
    videoId: 'vid-1',
    videoTitle: 'A video',
    thumbnailUrl: null,
    creatorFolderName: 'Alice',
    status: 'success',
    errorMessage: null,
    errorRetryable: false,
    finishedAt: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  formatDateMock.mockImplementation((date: Date | string | null) => `formatted:${String(date)}`)
  setDateFormat(false)
  setRetry()
})

describe('FinishedDownloadsList — top-level states', () => {
  it('renders a skeleton placeholder while the history query is loading', () => {
    setHistory({ data: undefined, isLoading: true })
    const { container } = render(<FinishedDownloadsList />)
    // The skeleton has no role/text — assert via its sizing class.
    expect(container.querySelector('.h-32')).toBeInTheDocument()
    expect(screen.queryByText(t('finished.emptyTitle'))).not.toBeInTheDocument()
  })

  it('renders the empty state when data is undefined (loaded, no rows)', () => {
    setHistory({ data: undefined, isLoading: false })
    render(<FinishedDownloadsList />)
    expect(screen.getByText(t('finished.emptyTitle'))).toBeInTheDocument()
    expect(screen.getByText(t('finished.emptyDescription'))).toBeInTheDocument()
  })

  it('renders the empty state when data is an empty array', () => {
    setHistory({ data: [], isLoading: false })
    render(<FinishedDownloadsList />)
    expect(screen.getByText(t('finished.emptyTitle'))).toBeInTheDocument()
  })

  it('requests the most recent 50 entries', () => {
    setHistory({ data: [], isLoading: false })
    render(<FinishedDownloadsList />)
    expect(useDownloadHistory).toHaveBeenCalledWith(50)
  })

  it('renders one row per entry, keyed by id', () => {
    setHistory({
      data: [
        makeEntry({ id: 'a', videoId: 'va', videoTitle: 'First' }),
        makeEntry({ id: 'b', videoId: 'vb', videoTitle: 'Second' })
      ],
      isLoading: false
    })
    render(<FinishedDownloadsList />)
    expect(screen.getAllByText('First')).toHaveLength(1)
    expect(screen.getAllByText('Second')).toHaveLength(1)
  })
})

describe('FinishedDownloadsList — success rows', () => {
  it('renders a success entry as a video link (icon + title link + open-video button)', () => {
    setHistory({
      data: [makeEntry({ status: 'success', videoId: 'vid-9', videoTitle: 'Great clip' })],
      isLoading: false
    })
    const { container } = render(<FinishedDownloadsList />)

    // Title is rendered as a Link to the video route.
    const titleLink = screen.getByText('Great clip')
    expect(titleLink.closest('a')).toHaveAttribute('data-to', '/videos/$videoId')
    expect(titleLink.closest('a')).toHaveAttribute('data-video-id', 'vid-9')

    // Open-video action button (also a Link).
    const openLink = screen.getByText(t('finished.openVideo'))
    expect(openLink.closest('a')).toHaveAttribute('data-video-id', 'vid-9')

    // Success icon (emerald check) present; no error badge.
    expect(container.querySelector('.text-emerald-500')).toBeInTheDocument()
    expect(screen.queryByText(t('finished.errorBadge'))).not.toBeInTheDocument()
  })

  it('falls back to youtubeUrl when a success entry has no videoTitle', () => {
    setHistory({
      data: [
        makeEntry({
          status: 'success',
          videoId: 'vid-9',
          videoTitle: null,
          youtubeUrl: 'https://youtu.be/nolabel'
        })
      ],
      isLoading: false
    })
    render(<FinishedDownloadsList />)
    expect(screen.getByText('https://youtu.be/nolabel')).toBeInTheDocument()
  })

  it('renders a success entry without a videoId as plain text (no link, no open button)', () => {
    setHistory({
      data: [makeEntry({ status: 'success', videoId: null, videoTitle: 'No id yet' })],
      isLoading: false
    })
    render(<FinishedDownloadsList />)

    // Title is plain text, not an anchor.
    const title = screen.getByText('No id yet')
    expect(title.closest('a')).toBeNull()
    // No open-video action and no retry (success is never retryable here).
    expect(screen.queryByText(t('finished.openVideo'))).not.toBeInTheDocument()
    expect(screen.queryByText(t('finished.retry'))).not.toBeInTheDocument()
  })
})

describe('FinishedDownloadsList — error rows', () => {
  it('renders an error entry with the error icon, error badge and the message', () => {
    setHistory({
      data: [
        makeEntry({
          id: 'e1',
          status: 'error',
          videoId: null,
          videoTitle: 'Broke',
          errorMessage: 'yt-dlp exploded',
          errorRetryable: false
        })
      ],
      isLoading: false
    })
    const { container } = render(<FinishedDownloadsList />)

    expect(container.querySelector('.text-destructive')).toBeInTheDocument()
    expect(screen.getByText(t('finished.errorBadge'))).toBeInTheDocument()
    expect(screen.getByText('yt-dlp exploded')).toBeInTheDocument()
    // Not retryable → no retry button.
    expect(screen.queryByText(t('finished.retry'))).not.toBeInTheDocument()
  })

  it('omits the error message paragraph when errorMessage is null', () => {
    setHistory({
      data: [
        makeEntry({
          status: 'error',
          videoId: null,
          videoTitle: 'Broke quietly',
          errorMessage: null,
          errorRetryable: false
        })
      ],
      isLoading: false
    })
    render(<FinishedDownloadsList />)
    // Badge still there, but there is no extra message paragraph beyond the title.
    expect(screen.getByText(t('finished.errorBadge'))).toBeInTheDocument()
    expect(screen.getByText('Broke quietly')).toBeInTheDocument()
  })

  it('shows a Retry button for retryable errors', () => {
    setHistory({
      data: [makeEntry({ status: 'error', videoId: null, errorRetryable: true })],
      isLoading: false
    })
    render(<FinishedDownloadsList />)
    expect(screen.getByRole('button', { name: new RegExp(t('finished.retry')) })).toBeEnabled()
  })

  it('disables the Retry button while a retry mutation is pending', () => {
    setRetry({ isPending: true })
    setHistory({
      data: [makeEntry({ status: 'error', videoId: null, errorRetryable: true })],
      isLoading: false
    })
    render(<FinishedDownloadsList />)
    expect(screen.getByRole('button', { name: new RegExp(t('finished.retry')) })).toBeDisabled()
  })
})

describe('FinishedDownloadsList — retry behavior', () => {
  it('toasts success when the retry mutation resolves', async () => {
    const mutate = setRetry()
    // Drive the mutate callbacks: invoke onSuccess.
    mutate.mockImplementation(
      (_id: string, opts: { onSuccess: () => void; onError: (e: Error) => void }) => {
        opts.onSuccess()
      }
    )
    setHistory({
      data: [makeEntry({ id: 'retry-me', status: 'error', videoId: null, errorRetryable: true })],
      isLoading: false
    })
    const user = userEvent.setup()
    render(<FinishedDownloadsList />)

    await user.click(screen.getByRole('button', { name: new RegExp(t('finished.retry')) }))

    expect(mutate).toHaveBeenCalledWith('retry-me', expect.any(Object))
    expect(toastSuccess).toHaveBeenCalledWith(t('finished.retryQueued'))
    expect(toastError).not.toHaveBeenCalled()
  })

  it('toasts the error message when the retry mutation rejects', async () => {
    const mutate = setRetry()
    mutate.mockImplementation(
      (_id: string, opts: { onSuccess: () => void; onError: (e: Error) => void }) => {
        opts.onError(new Error('queue is full'))
      }
    )
    setHistory({
      data: [makeEntry({ status: 'error', videoId: null, errorRetryable: true })],
      isLoading: false
    })
    const user = userEvent.setup()
    render(<FinishedDownloadsList />)

    await user.click(screen.getByRole('button', { name: new RegExp(t('finished.retry')) }))

    expect(toastError).toHaveBeenCalledWith(
      t('finished.retryFailed', { message: 'queue is full' })
    )
    expect(toastSuccess).not.toHaveBeenCalled()
  })
})

describe('FinishedDownloadsList — metadata rendering', () => {
  it('renders the creator folder name when present', () => {
    setHistory({
      data: [makeEntry({ creatorFolderName: 'MrBeast' })],
      isLoading: false
    })
    render(<FinishedDownloadsList />)
    expect(screen.getByText('MrBeast')).toBeInTheDocument()
  })

  it('omits the creator folder name when null', () => {
    setHistory({
      data: [makeEntry({ creatorFolderName: null, videoTitle: 'No creator' })],
      isLoading: false
    })
    render(<FinishedDownloadsList />)
    expect(screen.getByText('No creator')).toBeInTheDocument()
  })

  it('formats the finishedAt timestamp once the date-format preset resolves', () => {
    setDateFormat(false)
    setHistory({
      data: [makeEntry({ finishedAt: '2026-03-03T12:00:00Z' })],
      isLoading: false
    })
    render(<FinishedDownloadsList />)
    expect(formatDateMock).toHaveBeenCalledWith('2026-03-03T12:00:00Z')
    expect(screen.getByText('formatted:2026-03-03T12:00:00Z')).toBeInTheDocument()
  })

  it('shows a neutral placeholder for the timestamp while the date preset is still loading', () => {
    setDateFormat(true)
    setHistory({
      data: [makeEntry({ finishedAt: '2026-03-03T12:00:00Z' })],
      isLoading: false
    })
    render(<FinishedDownloadsList />)
    // Em dash placeholder is rendered; formatDate is not called.
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(formatDateMock).not.toHaveBeenCalled()
  })
})

describe('FinishedDownloadsList — mixed list', () => {
  it('renders success and error rows side by side with their respective actions', () => {
    setHistory({
      data: [
        makeEntry({ id: 's', status: 'success', videoId: 'v-s', videoTitle: 'Worked' }),
        makeEntry({
          id: 'f',
          status: 'error',
          videoId: null,
          videoTitle: 'Failed',
          errorMessage: 'boom',
          errorRetryable: true
        })
      ],
      isLoading: false
    })
    const { container } = render(<FinishedDownloadsList />)

    // Both rows present.
    const rows = container.querySelectorAll('.divide-y > div')
    expect(rows).toHaveLength(2)
    expect(within(rows[0] as HTMLElement).getByText('Worked')).toBeInTheDocument()
    expect(within(rows[1] as HTMLElement).getByText('Failed')).toBeInTheDocument()

    // Success row → open-video link; error row → retry button.
    expect(screen.getByText(t('finished.openVideo'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: new RegExp(t('finished.retry')) })).toBeInTheDocument()
  })
})
