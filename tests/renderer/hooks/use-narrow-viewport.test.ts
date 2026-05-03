import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNarrowViewport } from '@/hooks/use-narrow-viewport'

interface FakeMql {
  matches: boolean
  addEventListener: (type: 'change', listener: (event: MediaQueryListEvent) => void) => void
  removeEventListener: (type: 'change', listener: (event: MediaQueryListEvent) => void) => void
  fire: (matches: boolean) => void
}

function makeFakeMql(initialMatches: boolean): FakeMql {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const mql: FakeMql = {
    matches: initialMatches,
    addEventListener: (_type, listener) => {
      listeners.add(listener)
    },
    removeEventListener: (_type, listener) => {
      listeners.delete(listener)
    },
    fire(matches) {
      mql.matches = matches
      listeners.forEach((l) => l({ matches } as MediaQueryListEvent))
    }
  }
  return mql
}

describe('useNarrowViewport', () => {
  let originalMatchMedia: typeof window.matchMedia | undefined

  beforeEach(() => {
    originalMatchMedia = window.matchMedia
  })

  afterEach(() => {
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia
    }
  })

  it('returns true when the viewport is below the threshold', () => {
    const mql = makeFakeMql(true)
    window.matchMedia = vi.fn().mockReturnValue(mql)
    const { result } = renderHook(() => useNarrowViewport())
    expect(result.current).toBe(true)
  })

  it('returns false when the viewport is at or above the threshold', () => {
    const mql = makeFakeMql(false)
    window.matchMedia = vi.fn().mockReturnValue(mql)
    const { result } = renderHook(() => useNarrowViewport())
    expect(result.current).toBe(false)
  })

  it('updates when the viewport crosses the threshold', () => {
    const mql = makeFakeMql(false)
    window.matchMedia = vi.fn().mockReturnValue(mql)
    const { result } = renderHook(() => useNarrowViewport())
    expect(result.current).toBe(false)
    act(() => mql.fire(true))
    expect(result.current).toBe(true)
    act(() => mql.fire(false))
    expect(result.current).toBe(false)
  })

  it('uses a custom threshold when provided', () => {
    const matchMediaSpy = vi.fn().mockReturnValue(makeFakeMql(false))
    window.matchMedia = matchMediaSpy
    renderHook(() => useNarrowViewport(800))
    expect(matchMediaSpy).toHaveBeenCalledWith('(max-width: 799px)')
  })
})
