import { useEffect, useState } from 'react'

/**
 * Reads `prefers-reduced-motion` from the OS and re-renders when the user
 * toggles it. Use this for surfaces that need finer control than the global
 * CSS media-query baseline — e.g. swapping an animated control bar for a
 * static one, or skipping a non-essential transition entirely.
 *
 * Returns false in non-browser environments (defensive; the hook only runs
 * in the renderer, but keeps SSR-safe semantics).
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (event: MediaQueryListEvent): void => setReduced(event.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return reduced
}
