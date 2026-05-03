import { useCallback, useEffect, useState } from 'react'
import { useShortcut } from './use-shortcut'

interface UseListKeyboardNavOptions {
  /** Total number of items in the list. The hook clamps focus when this shrinks. */
  count: number
  /** Fired when the user presses Enter on the focused item. */
  onOpen?: (index: number) => void
  /** Fired when the user presses `d` on the focused item. Caller is responsible for showing a confirm dialog. */
  onDelete?: (index: number) => void
  /** Disable all shortcuts (e.g. while a dialog is open and consuming keys). Default: true. */
  enabled?: boolean
}

interface UseListKeyboardNavResult {
  focusedIndex: number
  setFocusedIndex: (index: number) => void
  /**
   * Spread on each card/row's wrapper. Adds `data-focused` so Tailwind variants
   * like `data-[focused=true]:ring-2` highlight the active row, plus an
   * `onClick` that re-syncs focus on mouse interaction.
   */
  getItemProps: (index: number) => {
    'data-focused': 'true' | 'false'
    onMouseEnter: () => void
  }
}

/**
 * Lightweight j/k/Enter/d keyboard navigation for grids and tables. Each page
 * owns its own focusedIndex state via this hook and applies the visual
 * indicator via `data-focused`. The hook never owns DOM refs — it stays
 * agnostic of markup so every grid (cards, table rows, virtualized lists) can
 * use it with a few lines of integration.
 *
 * Mouse hover updates the focused index so users can switch between mouse and
 * keyboard without losing context.
 */
export function useListKeyboardNav({
  count,
  onOpen,
  onDelete,
  enabled = true
}: UseListKeyboardNavOptions): UseListKeyboardNavResult {
  const [focusedIndex, setFocusedIndex] = useState(-1)

  // Clamp focus when the list shrinks (e.g. after delete or filter change).
  useEffect(() => {
    if (focusedIndex >= count) {
      setFocusedIndex(count > 0 ? count - 1 : -1)
    }
  }, [count, focusedIndex])

  const next = useCallback(() => {
    if (count === 0) return
    setFocusedIndex((prev) => (prev < 0 ? 0 : Math.min(prev + 1, count - 1)))
  }, [count])

  const prev = useCallback(() => {
    if (count === 0) return
    setFocusedIndex((prevIdx) => (prevIdx <= 0 ? 0 : prevIdx - 1))
  }, [count])

  const open = useCallback(() => {
    if (focusedIndex < 0 || focusedIndex >= count) return
    onOpen?.(focusedIndex)
  }, [focusedIndex, count, onOpen])

  const remove = useCallback(() => {
    if (focusedIndex < 0 || focusedIndex >= count) return
    onDelete?.(focusedIndex)
  }, [focusedIndex, count, onDelete])

  useShortcut('j', next, { enabled })
  useShortcut('k', prev, { enabled })
  useShortcut('enter', open, { enabled: enabled && focusedIndex >= 0 })
  useShortcut('d', remove, { enabled: enabled && focusedIndex >= 0 && !!onDelete })

  const getItemProps = useCallback(
    (index: number) => ({
      'data-focused': (index === focusedIndex ? 'true' : 'false') as 'true' | 'false',
      onMouseEnter: () => setFocusedIndex(index)
    }),
    [focusedIndex]
  )

  return { focusedIndex, setFocusedIndex, getItemProps }
}
