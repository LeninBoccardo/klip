import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Subscribes to the main-process `db-updated` push event and
 * invalidates all TanStack Query caches so every visible query refetches.
 *
 * Mount this once near the root of the component tree.
 */
export function useDbListener(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    const unsubscribe = window.api.onDbUpdated(() => {
      queryClient.invalidateQueries()
    })
    return unsubscribe
  }, [queryClient])
}
