/** Summary returned after operation recovery completes */
export interface RecoverResult {
  /** Number of operations marked as completed (recovery succeeded) */
  completed: number
  /** Number of operations marked as rolled_back (recovery not possible) */
  rolledBack: number
  /** Total stale operations found (pending + in_progress) */
  total: number
}

/**
 * Port for crash-recovery of stale operations.
 * Runs at startup before reconciliation to clean up incomplete multi-step ops.
 */
export interface IRecoverOperations {
  execute(): RecoverResult
}
