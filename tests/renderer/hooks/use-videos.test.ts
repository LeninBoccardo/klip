import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, waitFor } from '@testing-library/react'
import {
  useDeleteVideo,
  useRestoreVideo,
  useFetchVideoDetail,
  useEnrichAllVideos
} from '@/hooks/use-videos'
import { queryKeys } from '@/lib/query-keys'
import { renderMutationHook } from '../helpers/test-utils'

const api = {
  deleteVideo: vi.fn(),
  restoreVideo: vi.fn(),
  fetchVideoDetail: vi.fn(),
  enrichAllVideos: vi.fn()
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset().mockResolvedValue(undefined))
  Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })
})

describe('useDeleteVideo', () => {
  it('invalidates videos.all on success', async () => {
    const { result, invalidateSpy } = renderMutationHook(() => useDeleteVideo())

    act(() => {
      result.current.mutate('video-1')
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.deleteVideo).toHaveBeenCalledWith('video-1')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.videos.all })
    // F28: a soft delete also invalidates the cross-cutting trees the
    // db-listener would refresh (collections embed the video; stats/search/tags
    // reflect its status) — these emit no db-updated push.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.collections.all })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.search.all })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.tags.all })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.stats.all })
  })
})

describe('useRestoreVideo', () => {
  it('invalidates videos.all on success', async () => {
    const { result, invalidateSpy } = renderMutationHook(() => useRestoreVideo())

    act(() => {
      result.current.mutate('video-1')
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.restoreVideo).toHaveBeenCalledWith('video-1')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.videos.all })
  })
})

describe('useFetchVideoDetail', () => {
  it('invalidates detail, transcript, and transcript-segments keys for the affected video', async () => {
    const { result, invalidateSpy } = renderMutationHook(() => useFetchVideoDetail())

    act(() => {
      result.current.mutate('video-1')
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.fetchVideoDetail).toHaveBeenCalledWith('video-1')
    // Three scoped invalidations — keyed on the videoId, not the full list.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.videos.detail('video-1') })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.videos.transcript('video-1')
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.videos.transcriptSegments('video-1')
    })
    expect(invalidateSpy).toHaveBeenCalledTimes(3)
  })
})

describe('useEnrichAllVideos', () => {
  it('invalidates videos.all on success', async () => {
    const { result, invalidateSpy } = renderMutationHook(() => useEnrichAllVideos())

    act(() => {
      result.current.mutate()
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.enrichAllVideos).toHaveBeenCalledOnce()
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.videos.all })
  })
})
