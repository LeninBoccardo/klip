import type { MigrateRootResult } from '@shared/types'

/**
 * Safely migrates all creator folders from the current root to a new root directory.
 * Tracks progress via the operations table and pushes progress events to the renderer.
 * Includes self-contained rollback on failure.
 */
export interface IMigrateRootFolder {
  execute(newRootPath: string): Promise<MigrateRootResult>
}
