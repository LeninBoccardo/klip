import { LANGUAGE_VALUES, DEFAULT_LANGUAGE, type Language } from '@shared/types'

/**
 * localStorage key used as the synchronous fast-path between sessions so the
 * very first paint can already be in the right language. The DB value
 * (settings.language) remains the durable source of truth and is reconciled
 * by `<PreferencesBootstrap />` after the React tree mounts.
 */
export const LANGUAGE_STORAGE_KEY = 'klip-language'

const SUPPORTED = new Set<Language>(LANGUAGE_VALUES)

/**
 * Map a BCP-47-ish tag (e.g. `pt-PT`, `es-AR`, `en-GB`) to one of our three
 * supported locales, or fall back to English.
 *
 * Brazilian Portuguese is the only Portuguese variant we ship, so any `pt-*`
 * resolves there. Same simplification for Spanish — `es-*` collapses to a
 * single Spanish bundle. Anything outside `[en, pt, es]` resolves to English.
 */
export function normalizeLanguageTag(tag: string | null | undefined): Language {
  if (!tag) return DEFAULT_LANGUAGE
  const lower = tag.toLowerCase()
  if (lower === 'pt-br' || lower.startsWith('pt')) return 'pt-BR'
  if (lower.startsWith('es')) return 'es'
  if (lower.startsWith('en')) return 'en'
  return DEFAULT_LANGUAGE
}

/**
 * Resolve the language to use at i18next init time. Order:
 *
 *   1. localStorage cache (fast — survives across sessions)
 *   2. `navigator.language` mapped through `normalizeLanguageTag`
 *   3. `DEFAULT_LANGUAGE`
 *
 * Pure of side effects beyond the localStorage read; safe to call before React
 * mounts. The reconciler later writes back the resolved value to both the DB
 * and localStorage on first launch.
 */
export function detectInitialLanguage(): Language {
  try {
    const stored = window.localStorage?.getItem(LANGUAGE_STORAGE_KEY)
    if (stored && SUPPORTED.has(stored as Language)) return stored as Language
  } catch {
    // Inaccessible localStorage (e.g. file://, privacy mode). Fall through.
  }

  const nav = typeof navigator !== 'undefined' ? navigator.language : null
  return normalizeLanguageTag(nav)
}
