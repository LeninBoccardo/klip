import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, waitFor } from '@testing-library/react'
import { useDeleteCut, useRestoreCut } from '@/hooks/use-cuts'
import { queryKeys } from '@/lib/query-keys'
import { renderMutationHook } from '../helpers/test-utils'

const deleteCut = vi.fn()
const restoreCut = vi.fn()

beforeEach(() => {
  deleteCut.mockReset().mockResolvedValue(undefined)
  restoreCut.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(window, 'api', {
    value: { deleteCut, restoreCut },
    writable: true,
    configurable: true
  })
})

describe('useDeleteCut', () => {
  it('invalidates cuts.all on success', async () => {
    const { result, invalidateSpy } = renderMutationHook(() => useDeleteCut())

    act(() => {
      result.current.mutate('cut-1')
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(deleteCut).toHaveBeenCalledWith('cut-1')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.cuts.all })
  })
})

describe('useRestoreCut', () => {
  it('invalidates cuts.all on success', async () => {
    const { result, invalidateSpy } = renderMutationHook(() => useRestoreCut())

    act(() => {
      result.current.mutate('cut-1')
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(restoreCut).toHaveBeenCalledWith('cut-1')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.cuts.all })
  })
})
