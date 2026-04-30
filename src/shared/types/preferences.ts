/**
 * UI/UX preferences persisted in the `settings` key/value table.
 *
 *   - `theme`    — color scheme. `'system'` follows OS `prefers-color-scheme`.
 *   - `language` — UI locale. On first launch resolved from `navigator.language`,
 *                  then persisted so OS-level changes don't silently shift the
 *                  app's language out from under the user.
 *
 * Setting keys are registered in `SETTING_KEYS` (see `./playback.ts`); the
 * write allowlist + per-key validator wiring lives in SettingsController.
 */

export type Theme = 'light' | 'dark' | 'system'
export type Language = 'en' | 'pt-BR' | 'es'

export const THEME_VALUES = ['light', 'dark', 'system'] as const satisfies readonly Theme[]
export const LANGUAGE_VALUES = ['en', 'pt-BR', 'es'] as const satisfies readonly Language[]

export const DEFAULT_THEME: Theme = 'system'
export const DEFAULT_LANGUAGE: Language = 'en'

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'pt-BR' || value === 'es'
}
