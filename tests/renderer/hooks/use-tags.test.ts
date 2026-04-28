import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import {
  useAllDistinctTags,
  useBulkUpdateTags,
  useRenameTagGlobally
} from '@/hooks/use-tags'
import { queryKeys } from '@/lib/query-keys'
import { createQueryWrapper, renderMutationHook } from '../helpers/test-utils'

const bulkUpdateTags = vi.fn()
const renameTagGlobally = vi.fn()
const getAllDistinctTags = vi.fn()

beforeEach(() => {
  bulkUpdateTags.mockReset().mockResolvedValue({ updated: 1, skipped: 0 })
  renameTagGlobally.mockReset().mockResolvedValue({ videosUpdated: 1, cutsUpdated: 0 })
  getAllDistinctTags
    .mockReset()
    .mockResolvedValue([{ tag: 'music', videoCount: 3, cutCount: 1 }])
  Object.defineProperty(window, 'api', {
    value: { bulkUpdateTags, renameTagGlobally, getAllDistinctTags },
    writable: true,
    configurable: true
  })
})

describe('useAllDistinctTags', () => {
  it('queries window.api.getAllDistinctTags and surfaces the result', async () => {
    const { result } = renderHook(() => useAllDistinctTags(), { wrapper: createQueryWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(getAllDistinctTags).toHaveBeenCalled()
    expect(result.current.data).toEqual([{ tag: 'music', videoCount: 3, cutCount: 1 }])
  })
})

describe('useBulkUpdateTags', () => {
  it('invalidates tags.all and videos.all on success when entityKind=video', async () => {
    const { result, invalidateSpy } = renderMutationHook(() => useBulkUpdateTags())

    act(() => {
      result.current.mutate({ entityKind: 'video', ids: ['v-1'], addTags: ['music'] })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(bulkUpdateTags).toHaveBeenCalledWith({
      entityKind: 'video',
      ids: ['v-1'],
      addTags: ['music']
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.tags.all })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.videos.all })
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: queryKeys.cuts.all })
  })

  it('invalidates tags.all and cuts.all on success when entityKind=cut', async () => {
    const { result, invalidateSpy } = renderMutationHook(() => useBulkUpdateTags())

    act(() => {
      result.current.mutate({ entityKind: 'cut', ids: ['c-1'], removeTags: ['stale'] })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.tags.all })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.cuts.all })
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: queryKeys.videos.all })
  })
})

describe('useRenameTagGlobally', () => {
  it('invalidates tags + videos + cuts trees on success', async () => {
    const { result, invalidateSpy } = renderMutationHook(() => useRenameTagGlobally())

    act(() => {
      result.current.mutate({ oldTag: 'old', newTag: 'new' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(renameTagGlobally).toHaveBeenCalledWith('old', 'new')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.tags.all })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.videos.all })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.cuts.all })
  })
})
