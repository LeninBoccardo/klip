import { useCallback, useMemo, useState } from 'react'

export interface MultiSelectAPI {
  /** Set of currently-selected ids. */
  selectedIds: Set<string>
  /** Convenience boolean — true when at least one entity is selected. */
  hasSelection: boolean
  /** Number of selected ids. */
  count: number
  /** Toggle selection for a single id. */
  toggle: (id: string) => void
  /** Select every id in `allIds`. */
  selectAll: (allIds: string[]) => void
  /** Clear the selection (returns to neutral state). */
  clear: () => void
  /** Replace the entire selection. */
  setSelection: (ids: string[]) => void
}

/**
 * Local selection state for a list/grid view.
 *
 * The hook deliberately keeps state component-local (not in zustand) — bulk
 * tag selection is per-grid and shouldn't bleed across routes when the user
 * navigates away.
 */
export function useMultiSelect(): MultiSelectAPI {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = useCallback((allIds: string[]) => {
    setSelectedIds(new Set(allIds))
  }, [])

  const clear = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const setSelection = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids))
  }, [])

  return useMemo(
    () => ({
      selectedIds,
      hasSelection: selectedIds.size > 0,
      count: selectedIds.size,
      toggle,
      selectAll,
      clear,
      setSelection
    }),
    [selectedIds, toggle, selectAll, clear, setSelection]
  )
}
