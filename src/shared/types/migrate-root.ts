/** Progress event pushed to the renderer during root migration */
export interface MigrateRootProgress {
  phase: 'moving' | 'updating_db' | 'reconciling'
  current: number
  total: number
  currentFolder?: string
}

/** Final result of a root migration */
export interface MigrateRootResult {
  success: boolean
  movedCount: number
  error?: string
}
