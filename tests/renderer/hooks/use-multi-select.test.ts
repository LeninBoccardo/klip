import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useMultiSelect } from '@/hooks/use-multi-select'

describe('useMultiSelect', () => {
  it('starts empty with hasSelection=false', () => {
    const { result } = renderHook(() => useMultiSelect())
    expect(result.current.selectedIds.size).toBe(0)
    expect(result.current.hasSelection).toBe(false)
    expect(result.current.count).toBe(0)
  })

  it('toggles a single id on/off', () => {
    const { result } = renderHook(() => useMultiSelect())

    act(() => result.current.toggle('a'))
    expect(result.current.selectedIds.has('a')).toBe(true)
    expect(result.current.count).toBe(1)
    expect(result.current.hasSelection).toBe(true)

    act(() => result.current.toggle('a'))
    expect(result.current.selectedIds.has('a')).toBe(false)
    expect(result.current.hasSelection).toBe(false)
  })

  it('selectAll replaces the selection with the supplied ids', () => {
    const { result } = renderHook(() => useMultiSelect())

    act(() => result.current.toggle('a'))
    act(() => result.current.selectAll(['x', 'y', 'z']))

    expect([...result.current.selectedIds].sort()).toEqual(['x', 'y', 'z'])
  })

  it('clear empties the selection', () => {
    const { result } = renderHook(() => useMultiSelect())
    act(() => result.current.selectAll(['a', 'b']))
    act(() => result.current.clear())
    expect(result.current.count).toBe(0)
  })

  it('setSelection replaces the selection wholesale', () => {
    const { result } = renderHook(() => useMultiSelect())
    act(() => result.current.setSelection(['1', '2']))
    expect([...result.current.selectedIds].sort()).toEqual(['1', '2'])
  })
})
