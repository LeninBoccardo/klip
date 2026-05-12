import type { DateFormatPreset } from '@shared/types'

const TWO_DIGIT = (n: number): string => n.toString().padStart(2, '0')

/**
 * Format a `Date` (or ISO string / `null`) for display using the user's
 * preferred preset.
 *
 *   - `'auto'` calls `Intl.DateTimeFormat(locale, { year, month, day })` —
 *     Chromium picks the regional ordering automatically based on the locale
 *     (pt-BR → `dd/MM/yyyy`, en-US → `MM/dd/yyyy`, etc.).
 *   - The numeric presets (`dd/MM/yyyy`, `MM/dd/yyyy`, `yyyy-MM-dd`) format
 *     manually with zero-padded two-digit days and months.
 *   - The short-month presets pull a localized month abbreviation from
 *     `Intl.DateTimeFormat` so `MMM` reads as "set." in pt-BR rather than
 *     hardcoded English "Sep".
 *
 * Returns `'—'` when the input is null or cannot be parsed, so callers can
 * inline the call without wrapping every site in a null check.
 */
export function formatDate(
  input: Date | string | null,
  preset: DateFormatPreset,
  locale: string
): string {
  if (input === null) return '—'
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) return '—'

  const day = date.getDate()
  const month = date.getMonth() + 1
  const year = date.getFullYear()

  switch (preset) {
    case 'auto':
      return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(date)
    case 'dd/MM/yyyy':
      return `${TWO_DIGIT(day)}/${TWO_DIGIT(month)}/${year}`
    case 'MM/dd/yyyy':
      return `${TWO_DIGIT(month)}/${TWO_DIGIT(day)}/${year}`
    case 'yyyy-MM-dd':
      return `${year}-${TWO_DIGIT(month)}-${TWO_DIGIT(day)}`
    case 'dd MMM yyyy': {
      const monthName = new Intl.DateTimeFormat(locale, { month: 'short' }).format(date)
      return `${TWO_DIGIT(day)} ${monthName} ${year}`
    }
    case 'MMM dd, yyyy': {
      const monthName = new Intl.DateTimeFormat(locale, { month: 'short' }).format(date)
      return `${monthName} ${TWO_DIGIT(day)}, ${year}`
    }
  }
}
