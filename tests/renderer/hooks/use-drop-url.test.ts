import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDropUrl } from '@/hooks/use-drop-url'
import { useAppStore } from '@/hooks/use-app-store'

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock
}))

const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args)
  }
}))

beforeEach(() => {
  navigateMock.mockReset()
  toastError.mockReset()
  useAppStore.setState({ pendingDropUrl: null })
})

afterEach(() => {
  // Drop any leftover listeners from a render that didn't unmount cleanly.
  document.body.innerHTML = ''
})

function makeDataTransfer(types: string[], data: Record<string, string> = {}): DataTransfer {
  return {
    types,
    getData: (k: string) => data[k] ?? '',
    dropEffect: 'none' as DataTransfer['dropEffect'],
    effectAllowed: 'all' as DataTransfer['effectAllowed'],
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    clearData: () => undefined,
    setData: () => undefined,
    setDragImage: () => undefined
  } as unknown as DataTransfer
}

function fireWindowEvent(type: string, dataTransfer: DataTransfer | null): void {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer, configurable: true })
  window.dispatchEvent(event)
}

describe('useDropUrl — activation', () => {
  it('starts inactive', () => {
    const { result } = renderHook(() => useDropUrl())
    expect(result.current).toBe(false)
  })

  it('flips active on dragenter when the data transfer carries text/uri-list', () => {
    const { result } = renderHook(() => useDropUrl())
    act(() => {
      fireWindowEvent('dragenter', makeDataTransfer(['text/uri-list']))
    })
    expect(result.current).toBe(true)
  })

  it('flips active on dragenter when the data transfer carries text/plain', () => {
    const { result } = renderHook(() => useDropUrl())
    act(() => {
      fireWindowEvent('dragenter', makeDataTransfer(['text/plain']))
    })
    expect(result.current).toBe(true)
  })

  it('ignores dragenter when no URL-bearing types are present', () => {
    const { result } = renderHook(() => useDropUrl())
    act(() => {
      fireWindowEvent('dragenter', makeDataTransfer(['Files']))
    })
    expect(result.current).toBe(false)
  })

  it('ignores dragenter with a null dataTransfer', () => {
    const { result } = renderHook(() => useDropUrl())
    act(() => {
      fireWindowEvent('dragenter', null)
    })
    expect(result.current).toBe(false)
  })
})

describe('useDropUrl — nested counter', () => {
  it('only collapses on the matching dragleave count (handles nested elements)', () => {
    // Three dragenters from nested elements followed by two dragleaves should
    // STILL be active. The third dragleave is what brings it to zero.
    const { result } = renderHook(() => useDropUrl())

    act(() => {
      fireWindowEvent('dragenter', makeDataTransfer(['text/uri-list']))
      fireWindowEvent('dragenter', makeDataTransfer(['text/uri-list']))
      fireWindowEvent('dragenter', makeDataTransfer(['text/uri-list']))
    })
    expect(result.current).toBe(true)

    act(() => {
      fireWindowEvent('dragleave', makeDataTransfer(['text/uri-list']))
      fireWindowEvent('dragleave', makeDataTransfer(['text/uri-list']))
    })
    expect(result.current).toBe(true)

    act(() => {
      fireWindowEvent('dragleave', makeDataTransfer(['text/uri-list']))
    })
    expect(result.current).toBe(false)
  })

  it('clamps the counter at zero so an excess dragleave is harmless', () => {
    const { result } = renderHook(() => useDropUrl())
    act(() => {
      // Excess leave events without enters should not push the counter
      // negative; otherwise the next enter wouldn't activate the overlay.
      fireWindowEvent('dragleave', makeDataTransfer(['text/uri-list']))
      fireWindowEvent('dragleave', makeDataTransfer(['text/uri-list']))
      fireWindowEvent('dragenter', makeDataTransfer(['text/uri-list']))
    })
    expect(result.current).toBe(true)
  })
})

describe('useDropUrl — drop', () => {
  it('navigates to /downloads and stashes the URL when the drop carries a valid YouTube URL', () => {
    const { result } = renderHook(() => useDropUrl())
    act(() => {
      fireWindowEvent('dragenter', makeDataTransfer(['text/uri-list']))
      fireWindowEvent(
        'drop',
        makeDataTransfer(['text/uri-list'], {
          'text/uri-list': 'https://www.youtube.com/watch?v=abc123'
        })
      )
    })

    expect(useAppStore.getState().pendingDropUrl).toBe('https://www.youtube.com/watch?v=abc123')
    expect(navigateMock).toHaveBeenCalledWith({ to: '/downloads' })
    expect(result.current).toBe(false)
    expect(toastError).not.toHaveBeenCalled()
  })

  it('falls back to text/plain when text/uri-list is empty', () => {
    renderHook(() => useDropUrl())
    act(() => {
      fireWindowEvent(
        'drop',
        makeDataTransfer(['text/plain'], {
          'text/plain': 'https://youtu.be/xyz'
        })
      )
    })
    expect(useAppStore.getState().pendingDropUrl).toBe('https://youtu.be/xyz')
    expect(navigateMock).toHaveBeenCalledWith({ to: '/downloads' })
  })

  it('toasts an error and does not navigate when the dropped text is not a URL', () => {
    renderHook(() => useDropUrl())
    act(() => {
      fireWindowEvent(
        'drop',
        makeDataTransfer(['text/plain'], { 'text/plain': 'just some text, not a url' })
      )
    })
    expect(navigateMock).not.toHaveBeenCalled()
    expect(useAppStore.getState().pendingDropUrl).toBeNull()
    expect(toastError).toHaveBeenCalled()
  })
})

describe('useDropUrl — cleanup', () => {
  it('removes the four window listeners on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useDropUrl())
    unmount()

    const types = removeSpy.mock.calls.map((c) => c[0])
    expect(types).toContain('dragenter')
    expect(types).toContain('dragover')
    expect(types).toContain('dragleave')
    expect(types).toContain('drop')
    removeSpy.mockRestore()
  })
})
