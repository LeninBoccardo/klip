import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useListKeyboardNav } from '@/hooks/use-list-keyboard-nav'

function dispatchKey(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

describe('useListKeyboardNav', () => {
  beforeEach(() => {
    document.body.focus()
  })

  it('starts with no focus', () => {
    const { result } = renderHook(() => useListKeyboardNav({ count: 5 }))
    expect(result.current.focusedIndex).toBe(-1)
  })

  it('j moves focus to first item then advances', () => {
    const { result } = renderHook(() => useListKeyboardNav({ count: 3 }))
    act(() => dispatchKey('j'))
    expect(result.current.focusedIndex).toBe(0)
    act(() => dispatchKey('j'))
    expect(result.current.focusedIndex).toBe(1)
  })

  it('j clamps at the last item', () => {
    const { result } = renderHook(() => useListKeyboardNav({ count: 2 }))
    act(() => dispatchKey('j'))
    act(() => dispatchKey('j'))
    act(() => dispatchKey('j'))
    expect(result.current.focusedIndex).toBe(1)
  })

  it('k moves focus backwards and clamps at 0', () => {
    const { result } = renderHook(() => useListKeyboardNav({ count: 3 }))
    act(() => dispatchKey('j'))
    act(() => dispatchKey('j'))
    expect(result.current.focusedIndex).toBe(1)
    act(() => dispatchKey('k'))
    expect(result.current.focusedIndex).toBe(0)
    act(() => dispatchKey('k'))
    expect(result.current.focusedIndex).toBe(0)
  })

  it('Enter calls onOpen with the focused index', () => {
    const onOpen = vi.fn()
    renderHook(() => useListKeyboardNav({ count: 3, onOpen }))
    act(() => dispatchKey('j'))
    act(() => dispatchKey('j'))
    act(() => dispatchKey('Enter'))
    expect(onOpen).toHaveBeenCalledWith(1)
  })

  it('Enter does not fire when nothing is focused', () => {
    const onOpen = vi.fn()
    renderHook(() => useListKeyboardNav({ count: 3, onOpen }))
    act(() => dispatchKey('Enter'))
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('d calls onDelete with the focused index', () => {
    const onDelete = vi.fn()
    renderHook(() => useListKeyboardNav({ count: 3, onDelete }))
    act(() => dispatchKey('j'))
    act(() => dispatchKey('d'))
    expect(onDelete).toHaveBeenCalledWith(0)
  })

  it('d is a no-op when no onDelete is passed', () => {
    renderHook(() => useListKeyboardNav({ count: 3 }))
    act(() => dispatchKey('j'))
    expect(() => act(() => dispatchKey('d'))).not.toThrow()
  })

  it('clamps focusedIndex when count shrinks', () => {
    const { result, rerender } = renderHook(
      ({ count }: { count: number }) => useListKeyboardNav({ count }),
      { initialProps: { count: 5 } }
    )
    act(() => dispatchKey('j'))
    act(() => dispatchKey('j'))
    act(() => dispatchKey('j'))
    expect(result.current.focusedIndex).toBe(2)
    rerender({ count: 2 })
    expect(result.current.focusedIndex).toBe(1)
  })

  it('resets focusedIndex to -1 when count drops to 0', () => {
    const { result, rerender } = renderHook(
      ({ count }: { count: number }) => useListKeyboardNav({ count }),
      { initialProps: { count: 3 } }
    )
    act(() => dispatchKey('j'))
    expect(result.current.focusedIndex).toBe(0)
    rerender({ count: 0 })
    expect(result.current.focusedIndex).toBe(-1)
  })

  it('getItemProps marks the focused item with data-focused=true', () => {
    const { result } = renderHook(() => useListKeyboardNav({ count: 3 }))
    act(() => dispatchKey('j'))
    expect(result.current.getItemProps(0)['data-focused']).toBe('true')
    expect(result.current.getItemProps(1)['data-focused']).toBe('false')
  })

  it('mouse hover updates focusedIndex via getItemProps onMouseEnter', () => {
    const { result } = renderHook(() => useListKeyboardNav({ count: 3 }))
    act(() => result.current.getItemProps(2).onMouseEnter())
    expect(result.current.focusedIndex).toBe(2)
  })

  it('disabled prevents all shortcuts from firing', () => {
    const onOpen = vi.fn()
    const { result } = renderHook(() =>
      useListKeyboardNav({ count: 3, onOpen, enabled: false })
    )
    act(() => dispatchKey('j'))
    expect(result.current.focusedIndex).toBe(-1)
    act(() => dispatchKey('Enter'))
    expect(onOpen).not.toHaveBeenCalled()
  })
})
