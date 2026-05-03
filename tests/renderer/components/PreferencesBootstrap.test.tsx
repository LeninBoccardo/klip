import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { createQueryWrapper } from '../helpers/test-utils'

// PreferencesBootstrap reconciles three durable preferences (theme, language)
// from SQLite into renderer-local stores (next-themes, i18next, <html lang>).
// Coverage targets the four branches the docblock describes:
// - DB has a value that differs from current → switch
// - DB has a value that matches current → no churn
// - DB is empty AND it's a language preference → persist the detected one
// - languageChanged event keeps <html lang> in sync

const setThemeSpy = vi.fn()
const useThemeMock = vi.fn()
vi.mock('next-themes', () => ({ useTheme: () => useThemeMock() }))

const useSettingMock = vi.fn()
const setSettingMutate = vi.fn()
vi.mock('@/hooks/use-settings', () => ({
  useSetting: (key: string) => useSettingMock(key),
  useSetSetting: () => ({ mutate: setSettingMutate })
}))

const detectInitialLanguageMock = vi.fn(() => 'en' as const)
vi.mock('@renderer/i18n/detect', () => ({
  detectInitialLanguage: () => detectInitialLanguageMock(),
  LANGUAGE_STORAGE_KEY: 'klip-language'
}))

import { PreferencesBootstrap } from '@components/PreferencesBootstrap'

function settingResult(
  value: string | null,
  opts: Partial<{ isLoading: boolean; isError: boolean }> = {}
): {
  data: string | null
  isLoading: boolean
  isError: boolean
} {
  return { data: value, isLoading: false, isError: false, ...opts }
}

describe('PreferencesBootstrap', () => {
  beforeEach(() => {
    setThemeSpy.mockReset()
    useThemeMock.mockReset()
    useSettingMock.mockReset()
    setSettingMutate.mockReset()
    detectInitialLanguageMock.mockReset().mockReturnValue('en')
    // Reset document language so cross-test leakage doesn't mask bugs.
    if (typeof document !== 'undefined') document.documentElement.lang = ''
  })

  function setupHooks(opts: {
    currentTheme?: string
    themeSetting: ReturnType<typeof settingResult>
    languageSetting: ReturnType<typeof settingResult>
  }): void {
    useThemeMock.mockReturnValue({
      theme: opts.currentTheme ?? 'system',
      setTheme: setThemeSpy
    })
    useSettingMock.mockImplementation((key: string) =>
      key === 'theme' ? opts.themeSetting : opts.languageSetting
    )
  }

  it('applies a DB theme that differs from the current next-themes value', async () => {
    setupHooks({
      currentTheme: 'system',
      themeSetting: settingResult('dark'),
      languageSetting: settingResult('en')
    })

    render(<PreferencesBootstrap />, { wrapper: createQueryWrapper() })

    await waitFor(() => expect(setThemeSpy).toHaveBeenCalledWith('dark'))
  })

  it('does NOT call setTheme when DB theme already matches current (no churn)', async () => {
    setupHooks({
      currentTheme: 'dark',
      themeSetting: settingResult('dark'),
      languageSetting: settingResult('en')
    })

    render(<PreferencesBootstrap />, { wrapper: createQueryWrapper() })

    // Wait long enough for both effects to fire.
    await waitFor(() => expect(setSettingMutate).not.toHaveBeenCalled())
    expect(setThemeSpy).not.toHaveBeenCalled()
  })

  it('ignores a DB theme that fails the isTheme guard (e.g. legacy garbage)', async () => {
    setupHooks({
      currentTheme: 'system',
      themeSetting: settingResult('chartreuse'),
      languageSetting: settingResult('en')
    })

    render(<PreferencesBootstrap />, { wrapper: createQueryWrapper() })

    // Give effects a tick to (not) fire.
    await new Promise((r) => setTimeout(r, 0))
    expect(setThemeSpy).not.toHaveBeenCalled()
  })

  it('persists the detected language on first launch (DB empty)', async () => {
    setupHooks({
      themeSetting: settingResult('dark'),
      languageSetting: settingResult(null)
    })
    detectInitialLanguageMock.mockReturnValue('pt-BR')

    render(<PreferencesBootstrap />, { wrapper: createQueryWrapper() })

    await waitFor(() =>
      expect(setSettingMutate).toHaveBeenCalledWith({ key: 'language', value: 'pt-BR' })
    )
  })

  it('skips the theme effect while the setting query is loading or errored', async () => {
    setupHooks({
      themeSetting: settingResult(null, { isLoading: true }),
      languageSetting: settingResult(null, { isError: true })
    })

    render(<PreferencesBootstrap />, { wrapper: createQueryWrapper() })

    await new Promise((r) => setTimeout(r, 0))
    expect(setThemeSpy).not.toHaveBeenCalled()
    expect(setSettingMutate).not.toHaveBeenCalled()
  })

  it('renders nothing (returns null)', () => {
    setupHooks({
      themeSetting: settingResult(null),
      languageSetting: settingResult(null)
    })
    const { container } = render(<PreferencesBootstrap />, { wrapper: createQueryWrapper() })
    expect(container).toBeEmptyDOMElement()
  })
})
