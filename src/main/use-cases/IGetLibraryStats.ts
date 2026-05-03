import type { LibraryStats } from '@shared/types'

/**
 * Bundles every dashboard aggregate into one IPC call. Backed by per-repo
 * count/sum methods and `IGetStorageStats`. All numbers come from the DB —
 * no disk walk — so the call is fast (single-digit ms in normal use).
 */
export interface IGetLibraryStats {
  execute(): LibraryStats
}
