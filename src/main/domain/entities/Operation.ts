/** Lifecycle status of a tracked operation */
export type OperationStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back'

/**
 * Type discriminator for operations.
 *
 * Implemented (a use case actually creates these): `migrate_root`
 * (MigrateRootFolder) and `render_cut` (RenderCutFromVideo). `rename_folder`
 * and `bulk_import` are RESERVED forward-compat seams — no use case creates
 * them yet, though RecoverOperations carries recovery branches so a future
 * feature has a recovery path ready.
 */
export type OperationType = 'rename_folder' | 'migrate_root' | 'bulk_import' | 'render_cut'

/**
 * A persistent record of a multi-step operation.
 * Used as a saga log for crash-safe FS + DB mutations.
 */
export interface Operation {
  id: string
  type: OperationType
  status: OperationStatus
  /** JSON-serialized operation-specific data (old/new paths, progress checkpoints) */
  payload: string
  error: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}
