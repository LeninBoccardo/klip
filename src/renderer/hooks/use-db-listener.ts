import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'

/**
 * Subscribes to the main-process `db-updated` push event and invalidates
 * the data-tree query caches so every visible data query refetches.
 *
 * Excludes ephemeral/push-driven trees (updater status) which already stay
 * in sync via their own subscriptions and don't benefit from invalidation.
 *
 * Mount this once near the root of the component tree.
 */
export function useDbListener(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    const unsubscribe = window.api.onDbUpdated(() => {
      // Targeted invalidation: only the trees backed by SQLite. Avoids
      // wasted refetches on the updater-status query and any future
      // push-driven query that already keeps itself current.
      queryClient.invalidateQueries({ queryKey: queryKeys.creators.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.videos.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.cuts.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.auditLog.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.operations.all })
    })
    return unsubscribe
  }, [queryClient])
}
