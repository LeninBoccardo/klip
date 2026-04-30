import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useSetSetting } from '@/hooks/use-settings'
import { isLanguage, SETTING_KEYS, type Language } from '@shared/types'
import { LANGUAGE_STORAGE_KEY } from '@renderer/i18n/detect'

export interface LanguagePreference {
  language: Language
  setLanguage: (next: Language) => void
}

/**
 * Active UI language + a setter that:
 *
 *   1. Calls `i18n.changeLanguage` so every `useTranslation` consumer
 *      re-renders with the new strings.
 *   2. Updates the localStorage cache so the next cold start paints in the
 *      right language before React mounts.
 *   3. Persists to the SQLite `settings` table so the choice survives a
 *      cleared localStorage / new install on the same DB.
 *
 * The DB -> i18n direction (cold start sync) is handled by
 * `<PreferencesBootstrap />`.
 */
export function useLanguagePreference(): LanguagePreference {
  const { i18n } = useTranslation()
  const setSetting = useSetSetting()

  const setLanguage = useCallback(
    (next: Language): void => {
      void i18n.changeLanguage(next)
      try {
        window.localStorage?.setItem(LANGUAGE_STORAGE_KEY, next)
      } catch {
        // Ignore — DB write below is the durable path.
      }
      setSetting.mutate({ key: SETTING_KEYS.language, value: next })
    },
    [i18n, setSetting]
  )

  const current: Language = isLanguage(i18n.language) ? i18n.language : 'en'
  return { language: current, setLanguage }
}
