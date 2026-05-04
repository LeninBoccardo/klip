import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '@renderer/i18n'
import { LanguageSettings } from '@/components/features/settings/LanguageSettings'
import { useLanguagePreference } from '@/hooks/use-language-preference'

vi.mock('@/hooks/use-language-preference', () => ({
  useLanguagePreference: vi.fn()
}))

const tSettings = (key: string): string => i18n.t(key, { ns: 'settings' })

const setLanguage = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useLanguagePreference).mockReturnValue({
    language: 'en',
    setLanguage
  })
})

describe('LanguageSettings', () => {
  it('renders the trigger labelled with the active language option', () => {
    render(<LanguageSettings />)
    // Radix Select shows the active value inside its trigger.
    expect(screen.getByText(tSettings('language.options.en'))).toBeInTheDocument()
  })

  it('opens the popover and lists all supported languages', async () => {
    const user = userEvent.setup()
    render(<LanguageSettings />)

    await user.click(screen.getByLabelText(tSettings('language.selectAria')))

    // The selected value plus the two other options become visible inside the
    // listbox. Use getAllByText since the active option also appears in the
    // trigger.
    expect(screen.getAllByText(tSettings('language.options.pt-BR')).length).toBeGreaterThan(0)
    expect(screen.getAllByText(tSettings('language.options.es')).length).toBeGreaterThan(0)
  })

  it('selecting a new language calls setLanguage with the new code', async () => {
    const user = userEvent.setup()
    render(<LanguageSettings />)

    await user.click(screen.getByLabelText(tSettings('language.selectAria')))
    // Click the Portuguese option from the listbox.
    const ptOption = screen
      .getAllByText(tSettings('language.options.pt-BR'))
      .find((el) => el.closest('[role="option"]'))
    if (!ptOption) throw new Error('expected pt-BR option to be present in the listbox')
    await user.click(ptOption)

    expect(setLanguage).toHaveBeenCalledWith('pt-BR')
  })
})
