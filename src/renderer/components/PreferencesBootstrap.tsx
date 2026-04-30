import { useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import { useTranslation } from 'react-i18next'
import { useSetting, useSetSetting } from '@/hooks/use-settings'
import { isLanguage, isTheme, SETTING_KEYS, type Language, type Theme } from '@shared/types'
import { detectInitialLanguage, LANGUAGE_STORAGE_KEY } from '@renderer/i18n/detect'

/**
 * One-shot reconciler that pulls the durable preference values out of the
 * SQLite `settings` table and applies them to the renderer-local stores
 * (`next-themes` + i18next + `<html lang>`).
 *
 * Bootstrap order on cold start:
 *
 *   1. Synchronous fast path (already done before this component mounts):
 *      - `next-themes` reads `klip-theme` from localStorage and sets the
 *        `<html>` class.
 *      - `i18n/index.ts` reads `klip-language` (or `navigator.language`) and
 *        inits i18next. The first React paint is in the right language.
 *
 *   2. Async reconcile (this component, after `useSetting` resolves):
 *      - Theme: if DB value differs from current next-themes value, switch.
 *        If DB is empty, do nothing — next-themes' default (`'system'`)
 *        wins until the user picks something.
 *      - Language: if DB value differs from current i18n language, switch
 *        and update the localStorage cache. If DB is empty (true first
 *        launch), persist the detected language so OS-level changes don't
 *        silently shift the app's language out from under the user.
 *
 *   3. Live: keep `<html lang>` in sync whenever i18next emits
 *      `languageChanged`. (next-themes already mutates the class for us.)
 *
 * Renders nothing.
 */
export function PreferencesBootstrap(): null {
  const { theme: currentTheme, setTheme } = useTheme()
  const { i18n } = useTranslation()

  const themeQuery = useSetting(SETTING_KEYS.theme)
  const languageQuery = useSetting(SETTING_KEYS.language)
  const setSetting = useSetSetting()

  // Latch — only reconcile each preference once, the first time the query
  // resolves. After that the user owns the mutations.
  const themeApplied = useRef(false)
  const languageApplied = useRef(false)

  useEffect(() => {
    if (themeApplied.current) return
    if (themeQuery.isLoading || themeQuery.isError) return
    themeApplied.current = true

    const dbTheme: Theme | null = isTheme(themeQuery.data) ? themeQuery.data : null
    if (dbTheme && dbTheme !== currentTheme) setTheme(dbTheme)
  }, [themeQuery.isLoading, themeQuery.isError, themeQuery.data, currentTheme, setTheme])

  useEffect(() => {
    if (languageApplied.current) return
    if (languageQuery.isLoading || languageQuery.isError) return
    languageApplied.current = true

    const dbLanguage: Language | null = isLanguage(languageQuery.data) ? languageQuery.data : null

    if (dbLanguage) {
      if (dbLanguage !== i18n.language) {
        void i18n.changeLanguage(dbLanguage)
        try {
          window.localStorage?.setItem(LANGUAGE_STORAGE_KEY, dbLanguage)
        } catch {
          // ignore
        }
      }
    } else {
      // First launch — persist the detected language so future OS changes
      // don't silently shift the app's language.
      const detected = detectInitialLanguage()
      setSetting.mutate({ key: SETTING_KEYS.language, value: detected })
    }
  }, [languageQuery.isLoading, languageQuery.isError, languageQuery.data, i18n, setSetting])

  // Keep `<html lang>` aligned with the active locale for a11y / screen
  // readers. Driven by i18next's event so it picks up programmatic changes
  // outside the `useLanguagePreference` flow too.
  useEffect(() => {
    const apply = (lng: string): void => {
      if (typeof document !== 'undefined') document.documentElement.lang = lng
    }
    apply(i18n.language)
    i18n.on('languageChanged', apply)
    return () => i18n.off('languageChanged', apply)
  }, [i18n])

  return null
}
