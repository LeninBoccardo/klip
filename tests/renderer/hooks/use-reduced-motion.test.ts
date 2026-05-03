import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

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

describe('useReducedMotion', () => {
  let originalMatchMedia: typeof window.matchMedia | undefined

  beforeEach(() => {
    originalMatchMedia = window.matchMedia
  })

  afterEach(() => {
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia
    }
  })

  it('returns true when the OS reports reduced-motion', () => {
    const mql = makeFakeMql(true)
    window.matchMedia = vi.fn().mockReturnValue(mql)
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(true)
  })

  it('returns false by default', () => {
    const mql = makeFakeMql(false)
    window.matchMedia = vi.fn().mockReturnValue(mql)
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)
  })

  it('updates when the OS toggles the preference', () => {
    const mql = makeFakeMql(false)
    window.matchMedia = vi.fn().mockReturnValue(mql)
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)
    act(() => mql.fire(true))
    expect(result.current).toBe(true)
    act(() => mql.fire(false))
    expect(result.current).toBe(false)
  })
})
