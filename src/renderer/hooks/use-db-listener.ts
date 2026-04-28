import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import type { DbUpdatedPayload, DbUpdateScope } from '@shared/types'

/**
 * Subscribes to the main-process `db-updated` push and invalidates the
 * affected query trees. The push carries a `scope[]` payload indicating
 * which entity tables changed; only the matching trees are invalidated so
 * bulk operations don't trigger a global refetch storm.
 *
 * Excludes ephemeral/push-driven trees (updater status) which already stay
 * in sync via their own subscriptions and don't benefit from invalidation.
 *
 * Mount this once near the root of the component tree.
 */
export function useDbListener(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    const unsubscribe = window.api.onDbUpdated((_event: unknown, data: DbUpdatedPayload) => {
      const scopes = new Set<DbUpdateScope>(data?.scope ?? ['all'])
      const includes = (s: DbUpdateScope): boolean => scopes.has('all') || scopes.has(s)

      if (includes('creators')) {
        queryClient.invalidateQueries({ queryKey: queryKeys.creators.all })
      }
      if (includes('videos')) {
        queryClient.invalidateQueries({ queryKey: queryKeys.videos.all })
      }
      if (includes('cuts')) {
        queryClient.invalidateQueries({ queryKey: queryKeys.cuts.all })
      }
      // Tag aggregation derives from videos+cuts, so any video/cut/all-scoped
      // push must also refresh the tag distinct-set used by autocomplete and
      // any future tag-management page.
      if (includes('videos') || includes('cuts')) {
        queryClient.invalidateQueries({ queryKey: queryKeys.tags.all })
      }

      // Audit log + operations + settings are cross-cutting — refresh on any
      // `'all'` push. Targeted entity scopes don't touch them (the audit log
      // append happens in the same transaction and is rendered by an
      // unbounded `useAuditLogRecent` query, so we don't refetch it on every
      // tag tweak).
      if (scopes.has('all')) {
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.all })
        queryClient.invalidateQueries({ queryKey: queryKeys.auditLog.all })
        queryClient.invalidateQueries({ queryKey: queryKeys.operations.all })
      }
    })
    return unsubscribe
  }, [queryClient])
}
