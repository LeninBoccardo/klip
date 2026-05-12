import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/select'
import { useSetSetting } from '@/hooks/use-settings'
import { useDateFormat } from '@/hooks/use-date-format'
import { formatDate } from '@/lib/format-date'
import {
  DATE_FORMAT_PRESETS,
  SETTING_KEYS,
  isDateFormatPreset,
  type DateFormatPreset
} from '@shared/types'

/**
 * Dropdown for the `dateFormat` preference. Each option label includes a
 * live preview of today's date rendered in that preset so the user can
 * compare side-by-side without guessing what the abstract template means.
 */
export function DateFormatSettings(): React.ReactElement {
  const { t, i18n } = useTranslation('settings')
  const { format } = useDateFormat()
  const setSetting = useSetSetting()

  const today = useMemo(() => new Date(), [])
  const locale = i18n.language || 'en'

  const handleChange = (next: string): void => {
    if (!isDateFormatPreset(next)) return
    setSetting.mutate({ key: SETTING_KEYS.dateFormat, value: next })
  }

  return (
    <Select value={format} onValueChange={handleChange}>
      <SelectTrigger className="w-72" aria-label={t('dateFormat.selectAria')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {DATE_FORMAT_PRESETS.map((preset) => (
          <SelectItem key={preset} value={preset}>
            {labelFor(preset, today, locale, t)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function labelFor(
  preset: DateFormatPreset,
  today: Date,
  locale: string,
  t: (key: string) => string
): string {
  const sample = formatDate(today, preset, locale)
  if (preset === 'auto') {
    return `${t('dateFormat.auto')} — ${sample}`
  }
  return `${preset} — ${sample}`
}
