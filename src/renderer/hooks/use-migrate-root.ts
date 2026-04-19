import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useCallback } from 'react'
import { useAppStore } from '@/hooks/use-app-store'
import { queryKeys } from '@/lib/query-keys'
import type { MigrateRootProgress, MigrateRootResult } from '@shared/types'

/**
 * Hook for root folder migration.
 *
 * Manages the blocking operation dialog via zustand store,
 * subscribes to real-time progress events, and provides
 * the mutation to trigger migration.
 */
export function useMigrateRoot() {
  const startBlocking = useAppStore((s) => s.startBlockingOperation)
  const updateProgress = useAppStore((s) => s.updateBlockingProgress)
  const endBlocking = useAppStore((s) => s.endBlockingOperation)
  const qc = useQueryClient()

  // Subscribe to progress events
  useEffect(() => {
    return window.api.onMigrateRootProgress((_event: unknown, data: MigrateRootProgress) => {
      updateProgress(data)
    })
  }, [updateProgress])

  const mutation = useMutation<MigrateRootResult, Error, string>({
    mutationFn: (newRootPath: string) => {
      startBlocking('Migrating root folder', 'Moving creator folders to the new location…')
      return window.api.migrateRoot(newRootPath)
    },
    onSuccess: (result) => {
      endBlocking()
      if (result.success) {
        qc.invalidateQueries({ queryKey: queryKeys.settings.all })
        qc.invalidateQueries({ queryKey: queryKeys.creators.all })
        qc.invalidateQueries({ queryKey: queryKeys.videos.all })
        qc.invalidateQueries({ queryKey: queryKeys.cuts.all })
      }
    },
    onError: () => {
      endBlocking()
    }
  })

  const selectFolder = useCallback(async (): Promise<string | null> => {
    return window.api.selectFolder()
  }, [])

  return { mutation, selectFolder }
}
