import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, waitFor } from '@testing-library/react'
import { useDeleteCreator, useRestoreCreator } from '@/hooks/use-creators'
import { queryKeys } from '@/lib/query-keys'
import { renderMutationHook } from '../helpers/test-utils'

const deleteCreator = vi.fn()
const restoreCreator = vi.fn()

beforeEach(() => {
  deleteCreator.mockReset().mockResolvedValue(undefined)
  restoreCreator.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(window, 'api', {
    value: { deleteCreator, restoreCreator },
    writable: true,
    configurable: true
  })
})

describe('useDeleteCreator', () => {
  it('invalidates creators.all on success', async () => {
    const { result, invalidateSpy } = renderMutationHook(() => useDeleteCreator())

    act(() => {
      result.current.mutate('creator-1')
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(deleteCreator).toHaveBeenCalledWith('creator-1')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.creators.all })
  })

  it('does not invalidate on error', async () => {
    deleteCreator.mockRejectedValue(new Error('boom'))
    const { result, invalidateSpy } = renderMutationHook(() => useDeleteCreator())

    act(() => {
      result.current.mutate('creator-1')
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalidateSpy).not.toHaveBeenCalled()
  })
})

describe('useRestoreCreator', () => {
  it('invalidates creators.all on success', async () => {
    const { result, invalidateSpy } = renderMutationHook(() => useRestoreCreator())

    act(() => {
      result.current.mutate('creator-1')
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(restoreCreator).toHaveBeenCalledWith('creator-1')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.creators.all })
  })
})
