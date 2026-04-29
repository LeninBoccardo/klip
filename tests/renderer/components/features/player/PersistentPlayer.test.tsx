import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PersistentPlayer } from '@/components/features/player/PersistentPlayer'
import { usePlayerSlot } from '@/components/features/player/player-slot-ref'
import { usePlayerStore } from '@/hooks/use-player-store'

// jsdom does not implement ResizeObserver — provide a no-op shim so the
// detail-mode positioning effect can run without throwing.
class ResizeObserverStub {
  observe(): void {
    // intentionally empty — jsdom shim
  }
  unobserve(): void {
    // intentionally empty — jsdom shim
  }
  disconnect(): void {
    // intentionally empty — jsdom shim
  }
}
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock
}))

const openMediaExternally = vi.fn()

beforeEach(() => {
  navigateMock.mockReset()
  openMediaExternally.mockReset().mockResolvedValue({ ok: true })
  Object.defineProperty(window, 'api', {
    value: { openMediaExternally },
    writable: true,
    configurable: true
  })
  act(() => {
    usePlayerStore.getState().stop()
    usePlayerStore.getState().setNavBehavior('floating')
    usePlayerSlot.getState().setElement(null)
  })
})

describe('PersistentPlayer', () => {
  it('renders nothing when the player is idle', () => {
    const { container } = render(<PersistentPlayer />)
    expect(container.querySelector('[data-testid="persistent-player"]')).toBeNull()
  })

  it('renders nothing in paused mode (decoder unmounted)', () => {
    act(() => {
      usePlayerStore.getState().play({ videoId: 'v-1', title: 'A' })
      usePlayerStore.getState().setMode('paused')
    })
    const { container } = render(<PersistentPlayer />)
    expect(container.querySelector('[data-testid="persistent-player"]')).toBeNull()
  })

  it('renders a portaled <video> in detail mode tagged with the mode', async () => {
    act(() => usePlayerStore.getState().play({ videoId: 'v-1', title: 'A', mode: 'detail' }))
    render(<PersistentPlayer />)

    const root = await screen.findByTestId('persistent-player')
    expect(root).toHaveAttribute('data-player-mode', 'detail')
    expect(root.querySelector('video')).not.toBeNull()
  })

  it('shows mini-mode overlay buttons (expand, close, open externally)', async () => {
    act(() => usePlayerStore.getState().play({ videoId: 'v-1', title: 'My Title', mode: 'mini' }))
    render(<PersistentPlayer />)

    expect(await screen.findByLabelText('Expand to detail')).toBeInTheDocument()
    expect(screen.getByLabelText('Close player')).toBeInTheDocument()
    expect(screen.getByLabelText('Open in external player')).toBeInTheDocument()
    expect(screen.getByText('My Title')).toBeInTheDocument()
  })

  it('close button stops the player (clears videoId)', async () => {
    act(() => usePlayerStore.getState().play({ videoId: 'v-1', title: 'A', mode: 'mini' }))
    render(<PersistentPlayer />)

    const user = userEvent.setup()
    await user.click(await screen.findByLabelText('Close player'))

    await waitFor(() => expect(usePlayerStore.getState().videoId).toBeNull())
    expect(usePlayerStore.getState().mode).toBe('idle')
  })

  it('expand button navigates to /videos/$videoId and flips mode to detail', async () => {
    act(() => usePlayerStore.getState().play({ videoId: 'v-1', title: 'A', mode: 'mini' }))
    render(<PersistentPlayer />)

    const user = userEvent.setup()
    await user.click(await screen.findByLabelText('Expand to detail'))

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/videos/$videoId',
      params: { videoId: 'v-1' }
    })
    await waitFor(() => expect(usePlayerStore.getState().mode).toBe('detail'))
  })

  it('"open externally" calls window.api.openMediaExternally for the active video', async () => {
    act(() => usePlayerStore.getState().play({ videoId: 'v-1', title: 'A', mode: 'mini' }))
    render(<PersistentPlayer />)

    const user = userEvent.setup()
    await user.click(await screen.findByLabelText('Open in external player'))

    await waitFor(() => expect(openMediaExternally).toHaveBeenCalledWith('video', 'v-1'))
  })
})
