import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useShortcut } from '@/hooks/use-shortcut'

function dispatchKey(
  key: string,
  modifiers: { meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean } = {}
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    metaKey: modifiers.meta,
    ctrlKey: modifiers.ctrl,
    shiftKey: modifiers.shift,
    altKey: modifiers.alt
  })
  window.dispatchEvent(event)
  return event
}

describe('useShortcut', () => {
  beforeEach(() => {
    document.body.focus()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires on a single matching key', () => {
    const handler = vi.fn()
    renderHook(() => useShortcut('?', handler))
    dispatchKey('?')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not fire when modifier keys are pressed for single-key shortcuts', () => {
    const handler = vi.fn()
    renderHook(() => useShortcut('/', handler))
    dispatchKey('/', { ctrl: true })
    expect(handler).not.toHaveBeenCalled()
  })

  it('fires on a modifier+key shortcut', () => {
    const handler = vi.fn()
    renderHook(() => useShortcut('mod+k', handler))
    dispatchKey('k', { meta: true })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('fires modifier shortcut with ctrl too (cross-platform mod)', () => {
    const handler = vi.fn()
    renderHook(() => useShortcut('mod+k', handler))
    dispatchKey('k', { ctrl: true })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not fire modifier shortcut without modifier', () => {
    const handler = vi.fn()
    renderHook(() => useShortcut('mod+k', handler))
    dispatchKey('k')
    expect(handler).not.toHaveBeenCalled()
  })

  it('fires a chord on prefix then suffix within window', () => {
    const handler = vi.fn()
    renderHook(() => useShortcut('g h', handler))
    dispatchKey('g')
    dispatchKey('h')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not fire chord when suffix arrives after the timeout', () => {
    const handler = vi.fn()
    renderHook(() => useShortcut('g h', handler, { chordTimeoutMs: 500 }))
    dispatchKey('g')
    vi.advanceTimersByTime(600)
    dispatchKey('h')
    expect(handler).not.toHaveBeenCalled()
  })

  it('cancels the chord buffer when an unrelated key is pressed', () => {
    const handler = vi.fn()
    renderHook(() => useShortcut('g h', handler))
    dispatchKey('g')
    dispatchKey('x')
    dispatchKey('h')
    expect(handler).not.toHaveBeenCalled()
  })

  it('suppresses single-key shortcut when an INPUT is focused', () => {
    const handler = vi.fn()
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    renderHook(() => useShortcut('?', handler))
    dispatchKey('?')
    expect(handler).not.toHaveBeenCalled()
    input.remove()
  })

  it('still fires modifier shortcut even when an INPUT is focused', () => {
    const handler = vi.fn()
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    renderHook(() => useShortcut('mod+k', handler))
    dispatchKey('k', { meta: true })
    expect(handler).toHaveBeenCalledTimes(1)
    input.remove()
  })

  it('fires single-key shortcut in INPUT when allowInInputs is true', () => {
    const handler = vi.fn()
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    renderHook(() => useShortcut('Escape', handler, { allowInInputs: true }))
    dispatchKey('Escape')
    expect(handler).toHaveBeenCalledTimes(1)
    input.remove()
  })

  it('does not fire when enabled=false', () => {
    const handler = vi.fn()
    renderHook(() => useShortcut('?', handler, { enabled: false }))
    dispatchKey('?')
    expect(handler).not.toHaveBeenCalled()
  })

  it('reads the latest handler without re-binding', () => {
    let calls = 0
    const { rerender } = renderHook(({ fn }: { fn: () => void }) => useShortcut('?', fn), {
      initialProps: {
        fn: () => {
          calls += 1
        }
      }
    })
    dispatchKey('?')
    expect(calls).toBe(1)

    rerender({
      fn: () => {
        calls += 100
      }
    })
    dispatchKey('?')
    expect(calls).toBe(101)
  })

  it('preventDefault is called on a match', () => {
    const handler = vi.fn()
    renderHook(() => useShortcut('?', handler))
    const event = dispatchKey('?')
    expect(event.defaultPrevented).toBe(true)
  })
})
