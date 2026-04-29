import { describe, it, expect, beforeEach } from 'vitest'
import { act } from '@testing-library/react'
import { usePlayerSlot } from '@/components/features/player/player-slot-ref'

beforeEach(() => {
  act(() => usePlayerSlot.getState().setElement(null))
})

describe('usePlayerSlot', () => {
  it('starts with no registered element', () => {
    expect(usePlayerSlot.getState().element).toBeNull()
  })

  it('setElement registers and clears the slot reference', () => {
    const node = document.createElement('div')
    act(() => usePlayerSlot.getState().setElement(node))
    expect(usePlayerSlot.getState().element).toBe(node)

    act(() => usePlayerSlot.getState().setElement(null))
    expect(usePlayerSlot.getState().element).toBeNull()
  })
})
