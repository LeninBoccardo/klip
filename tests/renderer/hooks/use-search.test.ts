import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useSearchAll } from '@/hooks/use-search'
import { createQueryWrapper } from '../helpers/test-utils'

const searchAll = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  searchAll.mockReset().mockResolvedValue({ creators: [], videos: [], cuts: [], tags: [] })
  Object.defineProperty(window, 'api', {
    value: { searchAll },
    writable: true,
    configurable: true
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useSearchAll', () => {
  it('does not fire when the query is empty', async () => {
    const { result } = renderHook(() => useSearchAll(''), { wrapper: createQueryWrapper() })

    await vi.advanceTimersByTimeAsync(1000)

    expect(searchAll).not.toHaveBeenCalled()
    expect(result.current.isFetching).toBe(false)
  })

  it('debounces by 200ms by default before calling window.api.searchAll', async () => {
    vi.useRealTimers()
    const { result, rerender } = renderHook((q: string) => useSearchAll(q), {
      wrapper: createQueryWrapper(),
      initialProps: 'c'
    })

    rerender('ca')
    rerender('cat')

    await waitFor(() => expect(searchAll).toHaveBeenCalledWith('cat', 8), { timeout: 1000 })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('forwards a custom limit and trims whitespace', async () => {
    vi.useRealTimers()
    renderHook(() => useSearchAll('  dogs  ', { limit: 3 }), {
      wrapper: createQueryWrapper()
    })

    await waitFor(() => expect(searchAll).toHaveBeenCalledWith('dogs', 3))
  })
})
