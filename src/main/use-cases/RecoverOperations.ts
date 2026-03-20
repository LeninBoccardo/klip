import type { IOperationRepository } from '@domain/repositories'
import type { IFileSystemReader } from '@domain/ports'
import type { Operation } from '@domain/entities'
import type { IRecoverOperations, RecoverResult } from './IRecoverOperations'

/**
 * Recovers stale operations left behind by a crash.
 *
 * Runs at startup **before** reconciliation and **before** the file watcher starts,
 * so there is no risk of concurrent events interfering.
 *
 * For each stale operation (status = 'pending' or 'in_progress'):
 *   - `rename_folder`: check if the new path exists → mark completed;
 *     else if old path exists → mark rolled_back.
 *   - `migrate_root`: always mark rolled_back (partial migrations are unsafe).
 *   - `bulk_import`: always mark rolled_back (no partial recovery).
 */
export class RecoverOperations implements IRecoverOperations {
  constructor(
    private operationRepo: IOperationRepository,
    private fsReader: IFileSystemReader
  ) {}

  execute(): RecoverResult {
    const pending = this.operationRepo.findByStatus('pending')
    const inProgress = this.operationRepo.findByStatus('in_progress')
    const stale = [...pending, ...inProgress]

    let completed = 0
    let rolledBack = 0

    for (const op of stale) {
      const recovered = this.recoverOperation(op)
      if (recovered) {
        completed++
      } else {
        rolledBack++
      }
    }

    return { completed, rolledBack, total: stale.length }
  }

  /**
   * Attempts to recover a single operation.
   * @returns `true` if the operation was marked completed, `false` if rolled back.
   */
  private recoverOperation(op: Operation): boolean {
    switch (op.type) {
      case 'rename_folder':
        return this.recoverRenameFolderOp(op)
      case 'migrate_root':
        return this.recoverMigrateRootOp(op)
      case 'bulk_import':
        return this.recoverBulkImportOp(op)
      default:
        // Unknown type — roll back to be safe
        this.markRolledBack(op.id, `Unknown operation type: ${op.type}`)
        return false
    }
  }

  private recoverRenameFolderOp(op: Operation): boolean {
    try {
      const payload = JSON.parse(op.payload) as { oldPath?: string; newPath?: string }
      const { oldPath, newPath } = payload

      if (!oldPath || !newPath) {
        this.markRolledBack(op.id, 'Missing oldPath or newPath in payload')
        return false
      }

      // If new path already exists, the rename completed successfully
      if (this.fsReader.directoryExists(newPath)) {
        this.operationRepo.updateStatus(op.id, 'completed')
        return true
      }

      // If old path still exists, the rename never happened — roll back
      if (this.fsReader.directoryExists(oldPath)) {
        this.markRolledBack(op.id, 'Rename did not complete: old path still exists')
        return false
      }

      // Neither path exists — ambiguous state, roll back
      this.markRolledBack(op.id, 'Neither old nor new path exists')
      return false
    } catch {
      this.markRolledBack(op.id, 'Failed to parse operation payload')
      return false
    }
  }

  private recoverMigrateRootOp(op: Operation): boolean {
    // Partial root migrations are unsafe to resume — always roll back
    this.markRolledBack(op.id, 'Root migration interrupted — rolled back for safety')
    return false
  }

  private recoverBulkImportOp(op: Operation): boolean {
    // No partial recovery for bulk imports — always roll back
    this.markRolledBack(op.id, 'Bulk import interrupted — rolled back for safety')
    return false
  }

  private markRolledBack(id: string, error: string): void {
    this.operationRepo.updateStatus(id, 'rolled_back', error)
  }
}
