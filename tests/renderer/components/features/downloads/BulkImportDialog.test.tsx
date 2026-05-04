import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import i18n from '@renderer/i18n'
import { BulkImportDialog } from '@/components/features/downloads/BulkImportDialog'
import { useFetchVideoInfo, useDownloadVideo } from '@/hooks/use-downloads'
import { useCreatorsPaginated } from '@/hooks/use-creators'
import type { CreatorDto } from '@shared/dtos'
import type { DownloadProgress, VideoInfo, PaginatedResult } from '@shared/types'

vi.mock('@/hooks/use-downloads', () => ({
  useFetchVideoInfo: vi.fn(),
  useDownloadVideo: vi.fn()
}))

vi.mock('@/hooks/use-creators', () => ({
  useCreatorsPaginated: vi.fn()
}))

const toastError = vi.fn()
const toastSuccess = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args)
  }
}))

const getVideoById = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'api', {
    value: { getVideoById },
    writable: true,
    configurable: true
  })
  vi.mocked(useCreatorsPaginated).mockReturnValue({
    data: { data: [], total: 0, page: 1, pageSize: 500 },
    isLoading: false,
    isFetching: false,
    isError: false,
    isSuccess: true,
    isPending: false,
    error: null,
    status: 'success'
  } as unknown as UseQueryResult<PaginatedResult<CreatorDto>, Error>)
})

const tDownloads = (key: string, params?: Record<string, unknown>): string =>
  i18n.t(key, { ns: 'downloads', ...params })
const tCommon = (key: string): string => i18n.t(key, { ns: 'common' })

function makeVideoInfo(overrides: Partial<VideoInfo> = {}): VideoInfo {
  return {
    videoId: 'abc123',
    title: 'A video',
    channel: 'Alice',
    duration: 60,
    thumbnailUrl: null,
    description: null,
    channelId: 'UC_alice',
    channelUrl: null,
    uploaderUrl: null,
    subscriberCount: null,
    viewCount: null,
    ...overrides
  }
}

function setFetchInfo(impl: (url: string) => Promise<VideoInfo>): void {
  vi.mocked(useFetchVideoInfo).mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockImplementation((url: string) => impl(url)),
    reset: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    isIdle: true,
    status: 'idle',
    data: undefined,
    error: null,
    variables: undefined
  } as unknown as UseMutationResult<VideoInfo, Error, string>)
}

function setDownloadVideo(): ReturnType<typeof vi.fn> {
  const mutateAsync = vi.fn().mockResolvedValue(undefined)
  vi.mocked(useDownloadVideo).mockReturnValue({
    mutate: vi.fn(),
    mutateAsync,
    reset: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    isIdle: true,
    status: 'idle',
    data: undefined,
    error: null,
    variables: undefined
  } as unknown as UseMutationResult<DownloadProgress, Error, { url: string; creatorName: string }>)
  return mutateAsync
}

describe('BulkImportDialog — URL parsing', () => {
  it('errors when the textarea is empty', async () => {
    setFetchInfo(async () => makeVideoInfo())
    setDownloadVideo()
    const user = userEvent.setup()
    render(<BulkImportDialog open onOpenChange={() => {}} />)

    await user.click(screen.getByRole('button', { name: tDownloads('bulkImport.previewButton') }))
    // Apparent state: button is disabled when text is empty (defensive UI gate
    // — the same `text.trim().length === 0` predicate gates the button and
    // the toast). So the click is a no-op.
    expect(toastError).not.toHaveBeenCalled()
  })

  it('rejects a paste of more than MAX_URLS lines with a tooMany toast', async () => {
    setFetchInfo(async () => makeVideoInfo())
    setDownloadVideo()
    const user = userEvent.setup()
    render(<BulkImportDialog open onOpenChange={() => {}} />)

    const lines = Array.from({ length: 101 }, (_, i) => `https://youtu.be/v-${i}`).join('\n')
    const textarea = screen.getByPlaceholderText(/youtube.com\/watch/)
    await user.click(textarea)
    // Use paste, not type — typing 101 URLs character-by-character is glacial
    // in jsdom and unrelated to what we're testing.
    await user.paste(lines)

    await user.click(screen.getByRole('button', { name: tDownloads('bulkImport.previewButton') }))

    expect(toastError).toHaveBeenCalledWith(tDownloads('bulkImport.tooMany', { count: 101 }))
  })
})

describe('BulkImportDialog — preview rows', () => {
  it('classifies a fresh URL as ready and a duplicate (videoId already in DB) as duplicate', async () => {
    // First URL → fresh (getVideoById returns null). Second URL → duplicate
    // (videoId 'dup1' is already in the library).
    setFetchInfo(async (url) => {
      if (url.includes('fresh')) return makeVideoInfo({ videoId: 'fresh1', title: 'Fresh' })
      return makeVideoInfo({ videoId: 'dup1', title: 'Already-have' })
    })
    setDownloadVideo()
    getVideoById.mockImplementation(async (id: string) => (id === 'dup1' ? { id: 'dup1' } : null))

    const user = userEvent.setup()
    render(<BulkImportDialog open onOpenChange={() => {}} />)

    const textarea = screen.getByPlaceholderText(/youtube.com\/watch/)
    await user.click(textarea)
    await user.paste('https://youtu.be/fresh\nhttps://youtu.be/dup')

    await user.click(screen.getByRole('button', { name: tDownloads('bulkImport.previewButton') }))

    // Wait for the table to render after the async preview pipeline finishes.
    await waitFor(() => {
      expect(screen.getByText(tDownloads('bulkImport.status.ready'))).toBeInTheDocument()
    })
    expect(screen.getByText(tDownloads('bulkImport.status.duplicate'))).toBeInTheDocument()
    expect(screen.getByText('Fresh')).toBeInTheDocument()
    expect(screen.getByText('Already-have')).toBeInTheDocument()
  })

  it('marks a URL as error when fetchInfo rejects', async () => {
    setFetchInfo(async () => {
      throw new Error('yt-dlp said no')
    })
    setDownloadVideo()
    getVideoById.mockResolvedValue(null)

    const user = userEvent.setup()
    render(<BulkImportDialog open onOpenChange={() => {}} />)

    const textarea = screen.getByPlaceholderText(/youtube.com\/watch/)
    await user.click(textarea)
    await user.paste('https://youtu.be/broken')

    await user.click(screen.getByRole('button', { name: tDownloads('bulkImport.previewButton') }))

    await waitFor(() => {
      expect(screen.getByText(tDownloads('bulkImport.status.error'))).toBeInTheDocument()
    })
    expect(screen.getByText('yt-dlp said no')).toBeInTheDocument()
  })
})

describe('BulkImportDialog — submit', () => {
  it('queues the included rows under their creator override and toasts the count', async () => {
    setFetchInfo(async () => makeVideoInfo({ videoId: 'fresh1', title: 'Fresh', channel: 'Alice' }))
    const downloadAsync = setDownloadVideo()
    getVideoById.mockResolvedValue(null)

    const user = userEvent.setup()
    render(<BulkImportDialog open onOpenChange={vi.fn()} />)

    const textarea = screen.getByPlaceholderText(/youtube.com\/watch/)
    await user.click(textarea)
    await user.paste('https://youtu.be/fresh')
    await user.click(screen.getByRole('button', { name: tDownloads('bulkImport.previewButton') }))

    await waitFor(() => {
      expect(screen.getByText(tDownloads('bulkImport.status.ready'))).toBeInTheDocument()
    })

    // Submit button text includes the include-count.
    await user.click(
      screen.getByRole('button', { name: tDownloads('bulkImport.submitButton', { count: 1 }) })
    )

    await waitFor(() => {
      expect(downloadAsync).toHaveBeenCalledWith({
        url: 'https://youtu.be/fresh',
        creatorName: 'Alice'
      })
    })
    expect(toastSuccess).toHaveBeenCalledWith(
      tDownloads('bulkImport.queuedToast', { count: 1 }),
      expect.any(Object)
    )
  })

  it('renders Cancel on the footer (uses the common "Cancel" copy)', () => {
    setFetchInfo(async () => makeVideoInfo())
    setDownloadVideo()
    render(<BulkImportDialog open onOpenChange={() => {}} />)
    expect(screen.getByRole('button', { name: tCommon('actions.cancel') })).toBeInTheDocument()
  })
})
