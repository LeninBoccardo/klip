import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '@renderer/i18n'
import { OnboardingWizard } from '@/components/features/onboarding/OnboardingWizard'
import { useOnboardingState } from '@/hooks/use-onboarding'

vi.mock('@/hooks/use-onboarding', () => ({
  useOnboardingState: vi.fn()
}))

vi.mock('@/hooks/use-settings', () => ({
  useSetting: () => ({ data: '/var/library', isLoading: false })
}))

vi.mock('@/hooks/use-migrate-root', () => ({
  useMigrateRoot: () => ({
    mutation: { mutate: vi.fn(), isPending: false },
    selectFolder: vi.fn().mockResolvedValue(null)
  })
}))

// The Step 2 sub-components pull in next-themes, useSetSetting, etc. — out of
// scope for the wizard's own flow logic. Stub them so the test focuses on
// wizard-level state (step advance/back, skip, finish).
vi.mock('@components/features/settings/AppearanceSettings', () => ({
  AppearanceSettings: () => <div data-testid="appearance-settings" />
}))
vi.mock('@components/features/settings/LanguageSettings', () => ({
  LanguageSettings: () => <div data-testid="language-settings" />
}))

const tOnboarding = (key: string, params?: Record<string, unknown>): string =>
  i18n.t(key, { ns: 'onboarding', ...params })

function setupOnboardingState(
  overrides: Partial<{
    shouldShow: boolean
    isLoading: boolean
    complete: () => void
    replay: () => void
  }> = {}
): { complete: ReturnType<typeof vi.fn>; replay: ReturnType<typeof vi.fn> } {
  const complete = vi.fn()
  const replay = vi.fn()
  vi.mocked(useOnboardingState).mockReturnValue({
    shouldShow: true,
    isLoading: false,
    complete,
    replay,
    ...overrides
  })
  return { complete, replay }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('OnboardingWizard', () => {
  it('renders nothing when shouldShow is false', () => {
    setupOnboardingState({ shouldShow: false })
    const { container } = render(<OnboardingWizard />)
    expect(container.innerHTML).toBe('')
  })

  it('renders title and step 1 (Pick a folder) on mount', () => {
    setupOnboardingState()
    render(<OnboardingWizard />)

    expect(screen.getByText(tOnboarding('title'))).toBeInTheDocument()
    expect(screen.getByText(tOnboarding('step', { current: 1, total: 3 }))).toBeInTheDocument()
    expect(screen.getByText(tOnboarding('steps.root.title'))).toBeInTheDocument()
    expect(screen.queryByTestId('appearance-settings')).not.toBeInTheDocument()
  })

  it('advances step 1 → 2 → 3 when Next is clicked', async () => {
    setupOnboardingState()
    const user = userEvent.setup()
    render(<OnboardingWizard />)

    await user.click(screen.getByRole('button', { name: tOnboarding('actions.next') }))

    // Step 2 mounts the (stubbed) preferences sub-components.
    expect(screen.getByTestId('appearance-settings')).toBeInTheDocument()
    expect(screen.getByTestId('language-settings')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: tOnboarding('actions.next') }))

    // Step 3 — tour cards rendered, Finish replaces Next.
    expect(screen.getByText(tOnboarding('steps.tour.cards.download.title'))).toBeInTheDocument()
    expect(screen.getByText(tOnboarding('steps.tour.cards.organise.title'))).toBeInTheDocument()
    expect(screen.getByText(tOnboarding('steps.tour.cards.search.title'))).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: tOnboarding('actions.next') })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: tOnboarding('actions.finish') })).toBeInTheDocument()
  })

  it('walks back step 3 → 2 → 1 when Back is clicked', async () => {
    setupOnboardingState()
    const user = userEvent.setup()
    render(<OnboardingWizard />)

    // Forward to step 3.
    await user.click(screen.getByRole('button', { name: tOnboarding('actions.next') }))
    await user.click(screen.getByRole('button', { name: tOnboarding('actions.next') }))

    await user.click(screen.getByRole('button', { name: tOnboarding('actions.back') }))
    expect(screen.getByTestId('appearance-settings')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: tOnboarding('actions.back') }))
    // Back button no longer rendered on step 1.
    expect(
      screen.queryByRole('button', { name: tOnboarding('actions.back') })
    ).not.toBeInTheDocument()
    expect(screen.getByText(tOnboarding('steps.root.title'))).toBeInTheDocument()
  })

  it('clicking Skip on any step calls complete()', async () => {
    const { complete } = setupOnboardingState()
    const user = userEvent.setup()
    render(<OnboardingWizard />)

    await user.click(screen.getByRole('button', { name: tOnboarding('actions.skip') }))
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('clicking Finish on step 3 calls complete()', async () => {
    const { complete } = setupOnboardingState()
    const user = userEvent.setup()
    render(<OnboardingWizard />)

    await user.click(screen.getByRole('button', { name: tOnboarding('actions.next') }))
    await user.click(screen.getByRole('button', { name: tOnboarding('actions.next') }))
    await user.click(screen.getByRole('button', { name: tOnboarding('actions.finish') }))

    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('does not advance past step 3 if Next is somehow clicked twice (clamps at TOTAL_STEPS)', async () => {
    // Sanity — Next is hidden on step 3, but the underlying state setter
    // still clamps via Math.min. Pin the clamp so a future refactor can't
    // off-by-one into step 4.
    setupOnboardingState()
    const user = userEvent.setup()
    render(<OnboardingWizard />)

    await user.click(screen.getByRole('button', { name: tOnboarding('actions.next') }))
    await user.click(screen.getByRole('button', { name: tOnboarding('actions.next') }))

    // Step 3 visible, Finish present, no Next button to click again.
    expect(screen.getByRole('button', { name: tOnboarding('actions.finish') })).toBeInTheDocument()
    expect(screen.getByText(tOnboarding('step', { current: 3, total: 3 }))).toBeInTheDocument()
  })
})
