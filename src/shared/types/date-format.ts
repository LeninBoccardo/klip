/**
 * Persisted preset for absolute-date display across the app.
 *
 *   - `'auto'` defers to the browser's `Intl.DateTimeFormat(locale)` so the
 *     order follows OS regional conventions (e.g. `dd/MM/yyyy` for pt-BR,
 *     `MM/dd/yyyy` for en-US).
 *   - Numeric presets are zero-padded, slash- or hyphen-separated.
 *   - Short-month presets render a localized month abbreviation via
 *     `Intl.DateTimeFormat(locale, { month: 'short' })`.
 *
 * Stored in the `settings` table under {@link SETTING_KEYS.dateFormat}.
 */
export type DateFormatPreset =
  | 'auto'
  | 'dd/MM/yyyy'
  | 'MM/dd/yyyy'
  | 'yyyy-MM-dd'
  | 'dd MMM yyyy'
  | 'MMM dd, yyyy'

export const DATE_FORMAT_PRESETS = [
  'auto',
  'dd/MM/yyyy',
  'MM/dd/yyyy',
  'yyyy-MM-dd',
  'dd MMM yyyy',
  'MMM dd, yyyy'
] as const satisfies readonly DateFormatPreset[]

export const DEFAULT_DATE_FORMAT: DateFormatPreset = 'auto'

export function isDateFormatPreset(value: unknown): value is DateFormatPreset {
  return (
    value === 'auto' ||
    value === 'dd/MM/yyyy' ||
    value === 'MM/dd/yyyy' ||
    value === 'yyyy-MM-dd' ||
    value === 'dd MMM yyyy' ||
    value === 'MMM dd, yyyy'
  )
}
