import { useEffect, useState } from 'react'

/**
 * Tracks whether the viewport is narrower than `maxPx`. Used to drive the
 * sidebar auto-collapse: when the user resizes below 960px the sidebar
 * folds away to give the content area breathing room. Default 960 sits
 * just under Tailwind's `lg` (1024) — wide enough to keep the sidebar
 * visible at typical laptop widths, narrow enough to recover space on
 * resize.
 *
 * Returns false in non-browser environments (defensive; the hook only
 * runs in the renderer, but keeps SSR-safe semantics).
 */
export function useNarrowViewport(maxPx = 960): boolean {
  const [narrow, setNarrow] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia(`(max-width: ${maxPx - 1}px)`).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(`(max-width: ${maxPx - 1}px)`)
    const onChange = (event: MediaQueryListEvent): void => setNarrow(event.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [maxPx])

  return narrow
}
