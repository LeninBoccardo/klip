import { describe, it, expect, beforeEach } from 'vitest'
import {
  normalizeLanguageTag,
  detectInitialLanguage,
  LANGUAGE_STORAGE_KEY
} from '@renderer/i18n/detect'

describe('normalizeLanguageTag', () => {
  it.each([
    ['pt-BR', 'pt-BR'],
    ['pt-br', 'pt-BR'],
    ['pt-PT', 'pt-BR'],
    ['pt', 'pt-BR'],
    ['es-AR', 'es'],
    ['es-MX', 'es'],
    ['es', 'es'],
    ['en-US', 'en'],
    ['en-GB', 'en'],
    ['en', 'en'],
    ['fr-FR', 'en'],
    ['de', 'en'],
    ['', 'en']
  ])('maps %s -> %s', (input, expected) => {
    expect(normalizeLanguageTag(input)).toBe(expected)
  })

  it('returns the default for null/undefined', () => {
    expect(normalizeLanguageTag(null)).toBe('en')
    expect(normalizeLanguageTag(undefined)).toBe('en')
  })
})

describe('detectInitialLanguage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('prefers a valid localStorage value over navigator.language', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'es')
    Object.defineProperty(window.navigator, 'language', {
      value: 'pt-BR',
      configurable: true
    })
    expect(detectInitialLanguage()).toBe('es')
  })

  it('ignores an unsupported localStorage value and falls back to navigator', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr')
    Object.defineProperty(window.navigator, 'language', {
      value: 'pt-PT',
      configurable: true
    })
    expect(detectInitialLanguage()).toBe('pt-BR')
  })

  it('falls back to navigator.language when localStorage is empty', () => {
    Object.defineProperty(window.navigator, 'language', {
      value: 'es-AR',
      configurable: true
    })
    expect(detectInitialLanguage()).toBe('es')
  })
})
