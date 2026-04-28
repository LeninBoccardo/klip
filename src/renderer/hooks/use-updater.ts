import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult
} from '@tanstack/react-query'
import { useEffect } from 'react'
import { queryKeys } from '@/lib/query-keys'
import type { UpdaterStatus } from '@shared/types'

/**
 * Reads the current auto-updater status. Subscribes to push events to keep
 * the cache in sync as the main process drives state transitions.
 *
 * Mount once near the route root so the toast watcher always has fresh data.
 */
export function useUpdaterStatus(): ReturnType<typeof useQuery<UpdaterStatus>> {
  const qc = useQueryClient()

  useEffect(() => {
    return window.api.onUpdaterStatus((_event, data) => {
      qc.setQueryData(queryKeys.updater.status, data)
    })
  }, [qc])

  return useQuery({
    queryKey: queryKeys.updater.status,
    queryFn: () => window.api.getUpdaterStatus()
  })
}

/**
 * Trigger a manual update check. Cache stays in sync via the push subscription
 * registered by `useUpdaterStatus`, so we don't write to the cache from here.
 */
export function useCheckForUpdates(): UseMutationResult<UpdaterStatus, Error, void> {
  return useMutation({
    mutationFn: () => window.api.checkForUpdates()
  })
}

/** Quit and install a previously downloaded update. */
export function useInstallUpdate(): UseMutationResult<void, Error, void> {
  return useMutation({
    mutationFn: () => window.api.installUpdate()
  })
}
