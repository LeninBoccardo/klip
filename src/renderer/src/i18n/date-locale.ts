import { useTranslation } from 'react-i18next'
import { enUS, ptBR, es, type Locale } from 'date-fns/locale'
import type { Language } from '@shared/types'

/**
 * Map our supported `Language` codes to date-fns `Locale` objects so
 * `formatDistanceToNow(..., { locale })` produces "há 3 horas" instead of
 * "3 hours ago" when the user picks pt-BR.
 */
export function getDateLocale(language: Language | string | undefined): Locale {
  if (language === 'pt-BR') return ptBR
  if (language === 'es') return es
  return enUS
}

/**
 * Hook that returns the active date-fns `Locale`. Re-renders the consumer
 * automatically when the user switches language because `useTranslation`
 * subscribes to i18next's `languageChanged` event.
 */
export function useDateLocale(): Locale {
  const { i18n } = useTranslation()
  return getDateLocale(i18n.language)
}
