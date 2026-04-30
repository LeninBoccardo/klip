import { useTranslation } from 'react-i18next'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/select'
import { useLanguagePreference } from '@/hooks/use-language-preference'
import { LANGUAGE_VALUES, isLanguage } from '@shared/types'

/**
 * Dropdown for the `language` preference. Three supported locales — selecting
 * one immediately swaps every `useTranslation` consumer and persists to DB.
 */
export function LanguageSettings(): React.ReactElement {
  const { t } = useTranslation('settings')
  const { language, setLanguage } = useLanguagePreference()

  const handleChange = (next: string): void => {
    if (!isLanguage(next)) return
    setLanguage(next)
  }

  return (
    <Select value={language} onValueChange={handleChange}>
      <SelectTrigger className="w-72" aria-label={t('language.selectAria')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LANGUAGE_VALUES.map((value) => (
          <SelectItem key={value} value={value}>
            {t(`language.options.${value}` as const)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
