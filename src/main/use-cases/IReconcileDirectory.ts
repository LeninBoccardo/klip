import type { ReconcileResult } from '@shared/types'

/** Re-exported from shared — canonical definition lives in @shared/types */
export type { ReconcileResult } from '@shared/types'

/**
 * Port for directory reconciliation.
 * Allows use-cases to depend on an abstraction rather than the concrete ReconcileDirectory.
 */
export interface IReconcileDirectory {
  /** Full reconciliation: scan entire root directory tree */
  execute(rootPath: string): ReconcileResult

  /**
   * Targeted reconciliation: reconcile a single creator and its children.
   * Used by the granular processing path when few files changed.
   */
  executeForCreator(rootPath: string, creatorName: string): ReconcileResult

  /**
   * Reconcile a batch of creators inside one outer transaction. Equivalent to
   * calling `executeForCreator` per name and merging results, but commits a
   * single audit-log batch and pays one BEGIN/COMMIT pair instead of N. Used
   * by the granular file-watcher path when one flush touches several creators.
   */
  executeForCreatorBatch(rootPath: string, creatorNames: string[]): ReconcileResult
}
