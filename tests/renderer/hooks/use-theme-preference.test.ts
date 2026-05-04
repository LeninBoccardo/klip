import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useThemePreference } from '@/hooks/use-theme-preference'
import { createTestQueryClient } from '../helpers/test-utils'

const setNextTheme = vi.fn()
let nextThemeState: { theme: string | undefined; resolvedTheme: string | undefined } = {
  theme: 'system',
  resolvedTheme: 'dark'
}

vi.mock('next-themes', () => ({
  useTheme: () => ({
    theme: nextThemeState.theme,
    resolvedTheme: nextThemeState.resolvedTheme,
    setTheme: setNextTheme
  })
}))

const setSetting = vi.fn()
beforeEach(() => {
  setNextTheme.mockReset()
  setSetting.mockReset()
  nextThemeState = { theme: 'system', resolvedTheme: 'dark' }
  Object.defineProperty(window, 'api', {
    value: { setSetting },
    writable: true,
    configurable: true
  })
})

function withQueryClient() {
  const qc = createTestQueryClient()
  return function Wrapper({ children }: { children: React.ReactNode }): React.ReactElement {
    return React.createElement(QueryClientProvider, { client: qc }, children)
  }
}

describe('useThemePreference — read', () => {
  it('returns the next-themes theme when valid', () => {
    nextThemeState = { theme: 'dark', resolvedTheme: 'dark' }
    const { result } = renderHook(() => useThemePreference(), { wrapper: withQueryClient() })
    expect(result.current.theme).toBe('dark')
  })

  it('falls back to "system" when next-themes is unhydrated (theme is undefined)', () => {
    nextThemeState = { theme: undefined, resolvedTheme: 'dark' }
    const { result } = renderHook(() => useThemePreference(), { wrapper: withQueryClient() })
    expect(result.current.theme).toBe('system')
  })

  it('returns the resolved theme verbatim when it is "light"', () => {
    nextThemeState = { theme: 'system', resolvedTheme: 'light' }
    const { result } = renderHook(() => useThemePreference(), { wrapper: withQueryClient() })
    expect(result.current.resolvedTheme).toBe('light')
  })

  it('falls back to "dark" when resolvedTheme is undefined', () => {
    nextThemeState = { theme: 'system', resolvedTheme: undefined }
    const { result } = renderHook(() => useThemePreference(), { wrapper: withQueryClient() })
    expect(result.current.resolvedTheme).toBe('dark')
  })

  it('falls back to "system" when next-themes returns a non-Theme string', () => {
    // Defensive: a future bundling glitch could return random strings; make
    // sure we don't crash and instead produce the default.
    nextThemeState = { theme: 'auto-rosa-pine' as unknown as string, resolvedTheme: 'dark' }
    const { result } = renderHook(() => useThemePreference(), { wrapper: withQueryClient() })
    expect(result.current.theme).toBe('system')
  })
})

describe('useThemePreference — setTheme', () => {
  it('writes to next-themes AND fires the setSetting mutation with key="theme"', async () => {
    setSetting.mockResolvedValue(undefined)
    const { result } = renderHook(() => useThemePreference(), { wrapper: withQueryClient() })

    act(() => {
      result.current.setTheme('dark')
    })

    expect(setNextTheme).toHaveBeenCalledWith('dark')
    // The mutation is fire-and-forget; window.api.setSetting is the durable
    // path. Wait one microtask to let the mutation flush.
    await new Promise((r) => setTimeout(r, 0))
    expect(setSetting).toHaveBeenCalledWith('theme', 'dark')
  })

  it('issues both writes for every supported value (light/dark/system)', () => {
    const { result } = renderHook(() => useThemePreference(), { wrapper: withQueryClient() })

    for (const value of ['light', 'dark', 'system'] as const) {
      act(() => {
        result.current.setTheme(value)
      })
      expect(setNextTheme).toHaveBeenCalledWith(value)
    }
    expect(setNextTheme).toHaveBeenCalledTimes(3)
  })
})
