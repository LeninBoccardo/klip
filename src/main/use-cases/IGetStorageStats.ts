import type { StorageStats } from '@shared/types'

/**
 * Returns a high-level breakdown of where the library's bytes live. Sourced
 * entirely from DB columns (videos.fileSize + cuts.fileSize) — fast, no
 * disk walk. The "untracked" category covers anything on disk that isn't
 * referenced from the DB; computing it would require a full tree walk and
 * is intentionally deferred to a follow-up.
 */
export interface IGetStorageStats {
  execute(): StorageStats
}
