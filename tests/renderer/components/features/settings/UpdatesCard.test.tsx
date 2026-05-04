import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import i18n from '@renderer/i18n'
import { UpdatesCard } from '@/components/features/settings/UpdatesCard'
import { useUpdaterStatus, useCheckForUpdates, useInstallUpdate } from '@/hooks/use-updater'
import type { UpdaterState, UpdaterStatus } from '@shared/types'

vi.mock('@/hooks/use-updater', () => ({
  useUpdaterStatus: vi.fn(),
  useCheckForUpdates: vi.fn(),
  useInstallUpdate: vi.fn()
}))

const tSettings = (key: string, params?: Record<string, unknown>): string =>
  i18n.t(key, { ns: 'settings', ...params })

function makeStatus(overrides: Partial<UpdaterStatus> = {}): UpdaterStatus {
  return {
    state: 'idle',
    currentVersion: '1.2.3',
    newVersion: null,
    downloadPercent: null,
    errorMessage: null,
    lastCheckedAt: null,
    ...overrides
  }
}

function makeStatusQuery(status: UpdaterStatus | null): UseQueryResult<UpdaterStatus, Error> {
  return {
    data: status ?? undefined,
    isLoading: false,
    isFetching: false,
    isError: false,
    isSuccess: status !== null,
    isPending: status === null,
    error: null,
    status: status === null ? 'pending' : 'success',
    refetch: vi.fn()
  } as unknown as UseQueryResult<UpdaterStatus, Error>
}

function makeMutation(): UseMutationResult<unknown, Error, void> {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    isIdle: true,
    isSuccess: false,
    status: 'idle',
    data: undefined,
    error: null,
    variables: undefined,
    reset: vi.fn()
  } as unknown as UseMutationResult<unknown, Error, void>
}

const checkMutation = makeMutation()
const installMutation = makeMutation()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useCheckForUpdates).mockReturnValue(
    checkMutation as unknown as UseMutationResult<UpdaterStatus, Error, void>
  )
  vi.mocked(useInstallUpdate).mockReturnValue(
    installMutation as unknown as UseMutationResult<void, Error, void>
  )
})

describe('UpdatesCard — gating', () => {
  it('returns null until status data is available', () => {
    vi.mocked(useUpdaterStatus).mockReturnValue(makeStatusQuery(null))
    const { container } = render(<UpdatesCard />)
    expect(container.innerHTML).toBe('')
  })
})

describe('UpdatesCard — StateBadge matrix', () => {
  it.each<UpdaterState>([
    'idle',
    'checking',
    'available',
    'downloading',
    'ready',
    'up-to-date',
    'error',
    'disabled'
  ])('renders the badge copy for state="%s"', (state) => {
    vi.mocked(useUpdaterStatus).mockReturnValue(
      makeStatusQuery(makeStatus({ state, downloadPercent: state === 'downloading' ? 42 : null }))
    )
    render(<UpdatesCard />)

    if (state === 'downloading') {
      // Downloading badge shows the percent, not a static label.
      expect(screen.getByText('42%')).toBeInTheDocument()
    } else {
      const labelKey =
        state === 'up-to-date'
          ? 'updates.badge.upToDate'
          : (`updates.badge.${state}` as 'updates.badge.idle')
      expect(screen.getByText(tSettings(labelKey))).toBeInTheDocument()
    }
  })
})

describe('UpdatesCard — Restart button', () => {
  it('only renders when state is "ready"', () => {
    vi.mocked(useUpdaterStatus).mockReturnValue(makeStatusQuery(makeStatus({ state: 'idle' })))
    const { unmount } = render(<UpdatesCard />)
    expect(
      screen.queryByRole('button', { name: tSettings('updates.restartButton') })
    ).not.toBeInTheDocument()
    unmount()

    vi.mocked(useUpdaterStatus).mockReturnValue(
      makeStatusQuery(makeStatus({ state: 'ready', newVersion: '2.0.0' }))
    )
    render(<UpdatesCard />)
    expect(
      screen.getByRole('button', { name: tSettings('updates.restartButton') })
    ).toBeInTheDocument()
  })

  it('clicking Restart fires the install mutation', async () => {
    vi.mocked(useUpdaterStatus).mockReturnValue(
      makeStatusQuery(makeStatus({ state: 'ready', newVersion: '2.0.0' }))
    )
    const user = userEvent.setup()
    render(<UpdatesCard />)

    await user.click(screen.getByRole('button', { name: tSettings('updates.restartButton') }))
    expect(installMutation.mutate).toHaveBeenCalledTimes(1)
  })
})

describe('UpdatesCard — Check button gating', () => {
  it.each<UpdaterState>(['checking', 'downloading', 'disabled'])(
    'disables Check during state="%s"',
    (state) => {
      vi.mocked(useUpdaterStatus).mockReturnValue(makeStatusQuery(makeStatus({ state })))
      render(<UpdatesCard />)
      expect(screen.getByRole('button', { name: tSettings('updates.checkButton') })).toBeDisabled()
    }
  )

  it('enables Check when state is idle and clicking fires the check mutation', async () => {
    vi.mocked(useUpdaterStatus).mockReturnValue(makeStatusQuery(makeStatus({ state: 'idle' })))
    const user = userEvent.setup()
    render(<UpdatesCard />)

    await user.click(screen.getByRole('button', { name: tSettings('updates.checkButton') }))
    expect(checkMutation.mutate).toHaveBeenCalledTimes(1)
  })
})

describe('UpdatesCard — version display + error', () => {
  it('renders the current version with a v prefix', () => {
    vi.mocked(useUpdaterStatus).mockReturnValue(
      makeStatusQuery(makeStatus({ currentVersion: '4.5.6' }))
    )
    render(<UpdatesCard />)
    expect(screen.getByText('v4.5.6')).toBeInTheDocument()
  })

  it('shows the new-version suffix on the available + ready states', () => {
    vi.mocked(useUpdaterStatus).mockReturnValue(
      makeStatusQuery(makeStatus({ state: 'available', newVersion: '2.0.0' }))
    )
    const { unmount } = render(<UpdatesCard />)
    expect(screen.getByText(/\(v2\.0\.0\)/)).toBeInTheDocument()
    unmount()

    vi.mocked(useUpdaterStatus).mockReturnValue(
      makeStatusQuery(makeStatus({ state: 'ready', newVersion: '3.0.0' }))
    )
    render(<UpdatesCard />)
    expect(screen.getByText(/\(v3\.0\.0\)/)).toBeInTheDocument()
  })

  it('renders the errorMessage when state is "error"', () => {
    vi.mocked(useUpdaterStatus).mockReturnValue(
      makeStatusQuery(makeStatus({ state: 'error', errorMessage: 'Network down' }))
    )
    render(<UpdatesCard />)
    expect(screen.getByText('Network down')).toBeInTheDocument()
  })
})
