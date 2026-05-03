import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useDownloadProgressListener,
  useFetchVideoInfo,
  useDownloadVideo,
  useCancelDownload
} from '@/hooks/use-downloads'
import { mockWindowApi, makeDownloadProgress, createQueryWrapper } from '../helpers/test-utils'
import { renderMutationHook } from '../helpers/test-utils'

// `useDownloadProgressListener` is the bridge between the main-process push
// channel and the zustand store. The two failure modes we want to catch:
//   1. Forgetting to return / call the unsubscribe → listeners pile up across
//      route mounts.
//   2. Misclassifying a terminal status (complete/error/cancelled) so the
//      removal timer never fires → ghost rows persist in the UI.

const upsertDownload = vi.fn()
const removeDownload = vi.fn()

vi.mock('@/hooks/use-app-store', () => ({
  useAppStore: (selector: (s: unknown) => unknown) => selector({ upsertDownload, removeDownload })
}))

describe('useDownloadProgressListener', () => {
  let unsubscribeSpy: ReturnType<typeof vi.fn>
  let api: ReturnType<typeof mockWindowApi>

  beforeEach(() => {
    upsertDownload.mockReset()
    removeDownload.mockReset()
    unsubscribeSpy = vi.fn()
    api = mockWindowApi()
    api.onDownloadProgress.mockImplementation(() => unsubscribeSpy)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('subscribes on mount and unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useDownloadProgressListener())

    expect(api.onDownloadProgress).toHaveBeenCalledTimes(1)
    expect(unsubscribeSpy).not.toHaveBeenCalled()

    unmount()
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1)
  })

  it('forwards a downloading event straight to upsert (no removal scheduled)', () => {
    renderHook(() => useDownloadProgressListener())
    const handler = api.onDownloadProgress.mock.calls[0][0] as (
      _: unknown,
      d: ReturnType<typeof makeDownloadProgress>
    ) => void

    act(() => handler(null, makeDownloadProgress({ status: 'downloading', percent: 50 })))

    expect(upsertDownload).toHaveBeenCalledTimes(1)
    expect(removeDownload).not.toHaveBeenCalled()

    // The 3s removal timer must NOT fire for a non-terminal status.
    act(() => vi.advanceTimersByTime(5000))
    expect(removeDownload).not.toHaveBeenCalled()
  })

  it.each(['complete', 'error', 'cancelled'] as const)(
    'on a terminal %s event, upserts immediately and removes after 3s',
    (status) => {
      renderHook(() => useDownloadProgressListener())
      const handler = api.onDownloadProgress.mock.calls[0][0] as (
        _: unknown,
        d: ReturnType<typeof makeDownloadProgress>
      ) => void

      act(() => handler(null, makeDownloadProgress({ status, downloadId: 'dl-x' })))

      expect(upsertDownload).toHaveBeenCalledTimes(1)
      expect(removeDownload).not.toHaveBeenCalled()

      // Just before 3s — still present.
      act(() => vi.advanceTimersByTime(2999))
      expect(removeDownload).not.toHaveBeenCalled()

      act(() => vi.advanceTimersByTime(2))
      expect(removeDownload).toHaveBeenCalledWith('dl-x')
    }
  )
})

describe('useFetchVideoInfo / useDownloadVideo / useCancelDownload', () => {
  let api: ReturnType<typeof mockWindowApi>

  beforeEach(() => {
    api = mockWindowApi()
  })

  it('useFetchVideoInfo invokes window.api.fetchVideoInfo with the URL', async () => {
    api.fetchVideoInfo.mockResolvedValue({ videoId: 'abc' })
    const { result } = renderHook(() => useFetchVideoInfo(), { wrapper: createQueryWrapper() })

    await act(async () => {
      await result.current.mutateAsync('https://yt/x')
    })

    expect(api.fetchVideoInfo).toHaveBeenCalledWith('https://yt/x')
  })

  it('useDownloadVideo invokes window.api.downloadVideo with url and creatorName', async () => {
    api.downloadVideo.mockResolvedValue({ downloadId: 'dl-1' })
    const { result } = renderHook(() => useDownloadVideo(), { wrapper: createQueryWrapper() })

    await act(async () => {
      await result.current.mutateAsync({ url: 'https://yt/x', creatorName: 'Creator' })
    })

    expect(api.downloadVideo).toHaveBeenCalledWith('https://yt/x', 'Creator')
  })

  it('useCancelDownload invokes window.api.cancelDownload with the downloadId', async () => {
    api.cancelDownload.mockResolvedValue(undefined)
    const { result } = renderMutationHook(() => useCancelDownload())

    await act(async () => {
      await result.current.mutateAsync('dl-1')
    })

    expect(api.cancelDownload).toHaveBeenCalledWith('dl-1')
  })
})
