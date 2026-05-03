import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import type { StorageStats, LibraryStats } from '@shared/types'

/**
 * Storage breakdown of the library — sums of `videos.fileSize` and
 * `cuts.fileSize`. The query stays in scope-tagged invalidation so it
 * refreshes after downloads, deletions, or creator moves.
 */
export function useStorageStats(): UseQueryResult<StorageStats, Error> {
  return useQuery({
    queryKey: queryKeys.stats.storage,
    queryFn: () => window.api.getStorageStats()
  })
}

/**
 * Bundled aggregate snapshot for the dashboard. Includes counts, top
 * creators, downloads-by-day, and storage stats.
 */
export function useLibraryStats(): UseQueryResult<LibraryStats, Error> {
  return useQuery({
    queryKey: queryKeys.stats.library,
    queryFn: () => window.api.getLibraryStats()
  })
}
