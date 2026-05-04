import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useLanguagePreference } from '@/hooks/use-language-preference'
import { LANGUAGE_STORAGE_KEY } from '@renderer/i18n/detect'
import { createTestQueryClient } from '../helpers/test-utils'

const setSetting = vi.fn()
const changeLanguage = vi.fn().mockResolvedValue(undefined)
let currentLanguage = 'en'

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next')
  return {
    ...actual,
    useTranslation: () => ({
      t: (k: string) => k,
      i18n: {
        get language() {
          return currentLanguage
        },
        changeLanguage
      }
    })
  }
})

beforeEach(() => {
  setSetting.mockReset().mockResolvedValue(undefined)
  changeLanguage.mockReset().mockResolvedValue(undefined)
  currentLanguage = 'en'
  Object.defineProperty(window, 'api', {
    value: { setSetting },
    writable: true,
    configurable: true
  })
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
})

function withQueryClient() {
  const qc = createTestQueryClient()
  return function Wrapper({ children }: { children: React.ReactNode }): React.ReactElement {
    return React.createElement(QueryClientProvider, { client: qc }, children)
  }
}

describe('useLanguagePreference — read', () => {
  it('returns the i18n language when it is one of the supported codes', () => {
    currentLanguage = 'pt-BR'
    const { result } = renderHook(() => useLanguagePreference(), { wrapper: withQueryClient() })
    expect(result.current.language).toBe('pt-BR')
  })

  it('falls back to "en" when i18n.language is not a supported language code', () => {
    currentLanguage = 'de'
    const { result } = renderHook(() => useLanguagePreference(), { wrapper: withQueryClient() })
    expect(result.current.language).toBe('en')
  })
})

describe('useLanguagePreference — setLanguage', () => {
  it('calls i18n.changeLanguage, writes localStorage cache, and fires setSetting', async () => {
    const { result } = renderHook(() => useLanguagePreference(), { wrapper: withQueryClient() })

    act(() => {
      result.current.setLanguage('es')
    })

    expect(changeLanguage).toHaveBeenCalledWith('es')
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('es')
    await new Promise((r) => setTimeout(r, 0))
    expect(setSetting).toHaveBeenCalledWith('language', 'es')
  })

  it('still fires the DB write even when localStorage throws (best-effort cache)', async () => {
    const setItem = vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    try {
      const { result } = renderHook(() => useLanguagePreference(), { wrapper: withQueryClient() })

      act(() => {
        result.current.setLanguage('pt-BR')
      })

      expect(changeLanguage).toHaveBeenCalledWith('pt-BR')
      await new Promise((r) => setTimeout(r, 0))
      expect(setSetting).toHaveBeenCalledWith('language', 'pt-BR')
    } finally {
      setItem.mockRestore()
    }
  })
})
