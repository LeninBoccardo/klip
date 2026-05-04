import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '@renderer/i18n'
import { AppearanceSettings } from '@/components/features/settings/AppearanceSettings'
import { useThemePreference } from '@/hooks/use-theme-preference'
import { useOnboardingState } from '@/hooks/use-onboarding'

vi.mock('@/hooks/use-theme-preference', () => ({
  useThemePreference: vi.fn()
}))
vi.mock('@/hooks/use-onboarding', () => ({
  useOnboardingState: vi.fn()
}))

const tSettings = (key: string): string => i18n.t(key, { ns: 'settings' })

const setTheme = vi.fn()
const replay = vi.fn()
const complete = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useThemePreference).mockReturnValue({
    theme: 'system',
    resolvedTheme: 'dark',
    setTheme
  })
  vi.mocked(useOnboardingState).mockReturnValue({
    shouldShow: false,
    isLoading: false,
    complete,
    replay
  })
})

describe('AppearanceSettings', () => {
  it('renders all three theme options', () => {
    render(<AppearanceSettings />)
    expect(screen.getByText(tSettings('appearance.options.light'))).toBeInTheDocument()
    expect(screen.getByText(tSettings('appearance.options.dark'))).toBeInTheDocument()
    expect(screen.getByText(tSettings('appearance.options.system'))).toBeInTheDocument()
  })

  it('reflects the active theme as the checked radio', () => {
    vi.mocked(useThemePreference).mockReturnValue({
      theme: 'dark',
      resolvedTheme: 'dark',
      setTheme
    })
    render(<AppearanceSettings />)
    expect(screen.getByLabelText(tSettings('appearance.options.dark'))).toBeChecked()
    expect(screen.getByLabelText(tSettings('appearance.options.light'))).not.toBeChecked()
  })

  it('selecting a different option calls setTheme with the new value', async () => {
    const user = userEvent.setup()
    render(<AppearanceSettings />)

    await user.click(screen.getByLabelText(tSettings('appearance.options.light')))
    expect(setTheme).toHaveBeenCalledWith('light')
  })

  it('Replay-tour button calls onboarding.replay', async () => {
    const user = userEvent.setup()
    render(<AppearanceSettings />)

    await user.click(screen.getByRole('button', { name: tSettings('appearance.replayTour') }))
    expect(replay).toHaveBeenCalledTimes(1)
  })
})
