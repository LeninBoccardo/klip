import { describe, it, expect, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { DetailPlayerSlot } from '@/components/features/player/DetailPlayerSlot'
import { usePlayerSlot } from '@/components/features/player/player-slot-ref'
import { usePlayerStore } from '@/hooks/use-player-store'

beforeEach(() => {
  act(() => {
    usePlayerSlot.getState().setElement(null)
    usePlayerStore.getState().stop()
    usePlayerStore.getState().setNavBehavior('floating')
  })
})

describe('DetailPlayerSlot', () => {
  it('registers its DOM node with the player slot store on mount', () => {
    const { container } = render(<DetailPlayerSlot />)
    const node = container.querySelector('[data-player-slot]')
    expect(node).not.toBeNull()
    expect(usePlayerSlot.getState().element).toBe(node)
  })

  it('clears the slot reference and demotes mode to mini under floating behavior', () => {
    act(() => {
      usePlayerStore.getState().setNavBehavior('floating')
      usePlayerStore.getState().play({ videoId: 'v-1', title: 'A' })
    })
    expect(usePlayerStore.getState().mode).toBe('detail')

    const { unmount } = render(<DetailPlayerSlot />)
    unmount()

    expect(usePlayerSlot.getState().element).toBeNull()
    expect(usePlayerStore.getState().mode).toBe('mini')
    expect(usePlayerStore.getState().videoId).toBe('v-1')
  })

  it('demotes to paused under pause behavior, retaining videoId for resume', () => {
    act(() => {
      usePlayerStore.getState().setNavBehavior('pause')
      usePlayerStore.getState().play({ videoId: 'v-1', title: 'A' })
    })

    const { unmount } = render(<DetailPlayerSlot />)
    unmount()

    expect(usePlayerStore.getState().mode).toBe('paused')
    expect(usePlayerStore.getState().videoId).toBe('v-1')
  })

  it('stops entirely under stop behavior', () => {
    act(() => {
      usePlayerStore.getState().setNavBehavior('stop')
      usePlayerStore.getState().play({ videoId: 'v-1', title: 'A' })
    })

    const { unmount } = render(<DetailPlayerSlot />)
    unmount()

    expect(usePlayerStore.getState().mode).toBe('idle')
    expect(usePlayerStore.getState().videoId).toBeNull()
  })

  it('does not touch the player when no video is loaded', () => {
    const { unmount } = render(<DetailPlayerSlot />)
    expect(usePlayerStore.getState().mode).toBe('idle')
    unmount()
    expect(usePlayerStore.getState().mode).toBe('idle')
  })
})
