import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { enUS, ptBR, es } from 'date-fns/locale'
import { getDateLocale, useDateLocale } from '@renderer/i18n/date-locale'
import i18n from '@renderer/i18n'

describe('getDateLocale', () => {
  it('returns ptBR for "pt-BR"', () => {
    expect(getDateLocale('pt-BR')).toBe(ptBR)
  })

  it('returns es for "es"', () => {
    expect(getDateLocale('es')).toBe(es)
  })

  it('returns enUS for "en"', () => {
    expect(getDateLocale('en')).toBe(enUS)
  })

  it('returns enUS for unknown language codes', () => {
    expect(getDateLocale('de')).toBe(enUS)
    expect(getDateLocale('fr')).toBe(enUS)
  })

  it('returns enUS when language is undefined', () => {
    expect(getDateLocale(undefined)).toBe(enUS)
  })
})

describe('useDateLocale', () => {
  it('returns the locale matching the current i18n language', async () => {
    await i18n.changeLanguage('en')
    const { result, rerender } = renderHook(() => useDateLocale())
    expect(result.current).toBe(enUS)

    await i18n.changeLanguage('pt-BR')
    rerender()
    expect(result.current).toBe(ptBR)

    await i18n.changeLanguage('es')
    rerender()
    expect(result.current).toBe(es)

    // Restore so the rest of the suite isn't on a non-default language.
    await i18n.changeLanguage('en')
  })
})
