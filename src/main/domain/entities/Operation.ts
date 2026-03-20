/** Lifecycle status of a tracked operation */
export type OperationStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back'

/** Type discriminator for operations */
export type OperationType = 'rename_folder' | 'migrate_root' | 'bulk_import'

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
