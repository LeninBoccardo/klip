import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, waitFor } from '@testing-library/react'
import { useReconcile } from '@/hooks/use-reconcile'
import { renderMutationHook } from '../helpers/test-utils'

const reconcile = vi.fn()

beforeEach(() => {
  reconcile.mockReset().mockResolvedValue({
    creatorsAdded: 0,
    creatorsRemoved: 0,
    videosAdded: 0,
    videosRemoved: 0,
    cutsAdded: 0,
    cutsRemoved: 0
  })
  Object.defineProperty(window, 'api', {
    value: { reconcile },
    writable: true,
    configurable: true
  })
})

describe('useReconcile', () => {
  it('invokes window.api.reconcile() and surfaces the result', async () => {
    const { result } = renderMutationHook(() => useReconcile())
    act(() => {
      result.current.mutate()
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(reconcile).toHaveBeenCalledTimes(1)
  })
})
