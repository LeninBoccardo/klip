import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useSetting } from '@/hooks/use-settings'
import { formatDate } from '@/lib/format-date'
import {
  DEFAULT_DATE_FORMAT,
  SETTING_KEYS,
  isDateFormatPreset,
  type DateFormatPreset
} from '@shared/types'

interface UseDateFormatResult {
  /** Currently active preset (read from settings, default `'auto'`). */
  format: DateFormatPreset
  /**
   * Format `date` for display in the active preset and current i18n locale.
   * Stable across renders within a single locale + preset, so callers can
   * use it inside dependency arrays without re-triggering effects every
   * render.
   */
  formatDate: (date: Date | string | null) => string
}

/**
 * React hook wrapper for {@link formatDate}. Reads the persisted preset and
 * the active i18n locale, and returns a `formatDate(date)` partial.
 *
 * Use this everywhere the app surfaces an absolute date to the user
 * (video upload date, finished-download timestamps, etc.). Relative-date
 * displays ("3 hours ago") stay on `formatDistanceToNow` from date-fns —
 * they don't need the preset.
 */
export function useDateFormat(): UseDateFormatResult {
  const { i18n } = useTranslation()
  const setting = useSetting(SETTING_KEYS.dateFormat)
  const format: DateFormatPreset = isDateFormatPreset(setting.data)
    ? setting.data
    : DEFAULT_DATE_FORMAT

  const locale = i18n.language || 'en'
  const formatter = useCallback(
    (date: Date | string | null) => formatDate(date, format, locale),
    [format, locale]
  )

  return { format, formatDate: formatter }
}
