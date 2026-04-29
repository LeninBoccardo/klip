import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { PlaybackSettings } from '@/components/features/settings/PlaybackSettings'

const getSetting = vi.fn()
const setSetting = vi.fn()

beforeEach(() => {
  getSetting.mockReset().mockResolvedValue('floating')
  setSetting.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(window, 'api', {
    value: { getSetting, setSetting },
    writable: true,
    configurable: true
  })
})

function renderWithProviders(ui: React.ReactElement): void {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  })
  render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('PlaybackSettings', () => {
  it('renders the persisted option as checked', async () => {
    getSetting.mockResolvedValue('pause')
    renderWithProviders(<PlaybackSettings />)

    const pauseRadio = await screen.findByRole('radio', { name: /pause and remember/i })
    await waitFor(() => expect(pauseRadio).toHaveAttribute('aria-checked', 'true'))
  })

  it('persists the new value when the user picks a different option', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PlaybackSettings />)

    const stopRadio = await screen.findByRole('radio', { name: /stop and reset/i })
    await user.click(stopRadio)

    await waitFor(() => expect(setSetting).toHaveBeenCalledWith('playbackOnNavigate', 'stop'))
  })

  it('renders all three option labels', async () => {
    renderWithProviders(<PlaybackSettings />)

    expect(await screen.findByText(/Float in mini-player/i)).toBeInTheDocument()
    expect(screen.getByText(/Pause and remember/i)).toBeInTheDocument()
    expect(screen.getByText(/Stop and reset/i)).toBeInTheDocument()
  })
})
