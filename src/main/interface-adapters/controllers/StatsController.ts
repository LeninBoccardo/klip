import type { IGetStorageStats } from '@use-cases/IGetStorageStats'
import type { IGetLibraryStats } from '@use-cases/IGetLibraryStats'
import { createTypedHandler } from './create-typed-handler'

/**
 * IPC controller for stats / dashboard reads. Both endpoints are pure
 * aggregate queries with no side effects and no audit footprint.
 */
export function registerStatsController(
  getStorageStats: IGetStorageStats,
  getLibraryStats: IGetLibraryStats
): void {
  createTypedHandler('get-storage-stats', async () => {
    return getStorageStats.execute()
  })

  createTypedHandler('get-library-stats', async () => {
    return getLibraryStats.execute()
  })
}
