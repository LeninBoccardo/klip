/** Summary returned after reconciliation completes */
export interface ReconcileResult {
  creatorsAdded: number
  creatorsMarkedMissing: number
  creatorsRecovered: number
  videosAdded: number
  videosMarkedMissing: number
  videosRecovered: number
  cutsAdded: number
  cutsMarkedMissing: number
  cutsRecovered: number
}

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
}
