import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useRecentEntities } from '@/hooks/use-recent-entities'

const STORAGE_KEY = 'klip:recent-entities:v1'

beforeEach(() => {
  window.localStorage.clear()
})

describe('useRecentEntities', () => {
  it('starts empty when localStorage has no entries', () => {
    const { result } = renderHook(() => useRecentEntities())
    expect(result.current.recents).toEqual([])
  })

  it('adds a new recent and persists it to localStorage', () => {
    const { result } = renderHook(() => useRecentEntities())
    act(() => result.current.addRecent({ kind: 'creator', id: 'c-1', label: 'Pet World' }))

    expect(result.current.recents).toHaveLength(1)
    expect(result.current.recents[0]).toMatchObject({
      kind: 'creator',
      id: 'c-1',
      label: 'Pet World'
    })
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')).toHaveLength(1)
  })

  it('moves an existing entry to the top instead of duplicating', () => {
    const { result } = renderHook(() => useRecentEntities())
    act(() => result.current.addRecent({ kind: 'video', id: 'v-1', label: 'A' }))
    act(() => result.current.addRecent({ kind: 'video', id: 'v-2', label: 'B' }))
    act(() => result.current.addRecent({ kind: 'video', id: 'v-1', label: 'A again' }))

    expect(result.current.recents.map((r) => r.id)).toEqual(['v-1', 'v-2'])
    // The label refreshes on re-add — useful when titles are renamed.
    expect(result.current.recents[0].label).toBe('A again')
  })

  it('caps the recent list at 5 entries', () => {
    const { result } = renderHook(() => useRecentEntities())
    act(() => {
      for (let i = 0; i < 7; i++) {
        result.current.addRecent({ kind: 'creator', id: `c-${i}`, label: `c${i}` })
      }
    })
    expect(result.current.recents).toHaveLength(5)
    // Most-recent-first order; oldest two were dropped.
    expect(result.current.recents.map((r) => r.id)).toEqual(['c-6', 'c-5', 'c-4', 'c-3', 'c-2'])
  })

  it('clearRecents wipes both state and localStorage', () => {
    const { result } = renderHook(() => useRecentEntities())
    act(() => result.current.addRecent({ kind: 'cut', id: 'cut-1', label: 'x', creatorId: 'c-1' }))
    expect(result.current.recents).toHaveLength(1)

    act(() => result.current.clearRecents())
    expect(result.current.recents).toEqual([])
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('[]')
  })

  it('survives malformed localStorage gracefully', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not-json')
    const { result } = renderHook(() => useRecentEntities())
    expect(result.current.recents).toEqual([])
  })

  it('rejects entries with unknown kinds', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { kind: 'creator', id: 'ok', label: 'Ok', visitedAt: 1 },
        { kind: 'bogus', id: 'no', label: 'no', visitedAt: 2 }
      ])
    )
    const { result } = renderHook(() => useRecentEntities())
    expect(result.current.recents).toHaveLength(1)
    expect(result.current.recents[0].id).toBe('ok')
  })
})
