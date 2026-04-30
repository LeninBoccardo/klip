import { useCallback } from 'react'
import { useTheme as useNextTheme } from 'next-themes'
import { useSetSetting } from '@/hooks/use-settings'
import { isTheme, SETTING_KEYS, type Theme } from '@shared/types'

export interface ThemePreference {
  /** Currently selected value (`'light' | 'dark' | 'system'`). */
  theme: Theme
  /** OS-resolved theme when `theme === 'system'`. Always concrete. */
  resolvedTheme: 'light' | 'dark'
  /** Persist a new theme to both `next-themes` (localStorage) and the DB. */
  setTheme: (next: Theme) => void
}

/**
 * Wraps `next-themes`' `useTheme` so any UI surface that flips the theme
 * also writes the choice to the SQLite settings table — keeping localStorage
 * (fast hydration) and the DB (durable source of truth) in sync.
 *
 * `next-themes` already mutates the `<html>` class and triggers a re-render
 * of every consumer; the DB write is fire-and-forget. The reverse direction
 * (DB -> next-themes on cold start) is handled by `<PreferencesBootstrap />`.
 */
export function useThemePreference(): ThemePreference {
  const { theme, resolvedTheme, setTheme: setNextTheme } = useNextTheme()
  const setSetting = useSetSetting()

  const setTheme = useCallback(
    (next: Theme): void => {
      setNextTheme(next)
      setSetting.mutate({ key: SETTING_KEYS.theme, value: next })
    },
    [setNextTheme, setSetting]
  )

  // Defensive fallback: until next-themes hydrates `theme` is `undefined`.
  // Treat that as `'system'` to match the provider's `defaultTheme`.
  const effectiveTheme: Theme = isTheme(theme) ? theme : 'system'
  const effectiveResolved: 'light' | 'dark' = resolvedTheme === 'light' ? 'light' : 'dark'

  return { theme: effectiveTheme, resolvedTheme: effectiveResolved, setTheme }
}
