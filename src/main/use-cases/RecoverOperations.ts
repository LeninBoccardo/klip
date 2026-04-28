import { z } from 'zod'
import type { IOperationRepository } from '@domain/repositories'
import type { IFileSystemReader, IFileSystemWriter, IPathResolver } from '@domain/ports'
import type { Operation } from '@domain/entities'
import { redactError } from '@domain/types/redact'
import type { IRecoverOperations, RecoverResult } from './IRecoverOperations'

// Operation payloads are stored as JSON strings in `operations.payload`. A
// tampered or partially-written row (e.g. from a crash mid-write or future
// schema change) must not crash recovery — every parse goes through a zod
// schema and an unparseable row gets rolled back with a clear error.
const renameFolderPayloadSchema = z.object({
  oldPath: z.string().min(1),
  newPath: z.string().min(1)
})

const migrateRootPayloadSchema = z.object({
  oldRoot: z.string().min(1),
  newRoot: z.string().min(1),
  movedSoFar: z.array(z.string())
})

type PayloadResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'parse-error' | 'schema-error' }

function parsePayload<T extends z.ZodType>(raw: string, schema: T): PayloadResult<z.infer<T>> {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'parse-error' }
  }
  const result = schema.safeParse(json)
  if (result.success) return { ok: true, value: result.data }
  return { ok: false, reason: 'schema-error' }
}

/**
 * Recovers stale operations left behind by a crash.
 *
 * Runs at startup **before** reconciliation and **before** the file watcher starts,
 * so there is no risk of concurrent events interfering.
 *
 * For each stale operation (status = 'pending' or 'in_progress'):
 *   - `rename_folder`: check if the new path exists → mark completed;
 *     else if old path exists → mark rolled_back.
 *   - `migrate_root`: replay `payload.movedSoFar` in reverse and physically move
 *     each folder back from new root → old root, then mark rolled_back. Best-effort
 *     per folder; failures are logged and the list of stranded folders is recorded
 *     in the operation's `error` field for the user.
 *   - `bulk_import`: always mark rolled_back (no partial recovery).
 */
export class RecoverOperations implements IRecoverOperations {
  constructor(
    private operationRepo: IOperationRepository,
    private fsReader: IFileSystemReader,
    private fsWriter: IFileSystemWriter,
    private pathResolver: IPathResolver
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

  /**
   * NOTE: forward-looking placeholder — no use case currently creates
   * `rename_folder` operations. The branch is kept so a future rename feature
   * has a recovery path that can disambiguate "rename completed" vs.
   * "rename never happened" by inspecting which path exists on disk.
   */
  private recoverRenameFolderOp(op: Operation): boolean {
    const result = parsePayload(op.payload, renameFolderPayloadSchema)
    if (!result.ok) {
      this.markRolledBack(
        op.id,
        result.reason === 'parse-error'
          ? 'Failed to parse operation payload'
          : 'Missing oldPath or newPath in payload'
      )
      return false
    }

    const { oldPath, newPath } = result.value

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
  }

  private recoverMigrateRootOp(op: Operation): boolean {
    const result = parsePayload(op.payload, migrateRootPayloadSchema)
    if (!result.ok) {
      this.markRolledBack(
        op.id,
        result.reason === 'parse-error'
          ? 'Failed to parse migrate_root payload — manual cleanup required'
          : 'Malformed migrate_root payload (missing oldRoot/newRoot/movedSoFar)'
      )
      return false
    }

    const { oldRoot, newRoot, movedSoFar } = result.value

    // Replay moves in reverse. Skip folders that were never moved or whose
    // source no longer exists at newRoot (already rolled back manually, or
    // never made it in the first place).
    const stranded: string[] = []
    for (const folder of movedSoFar) {
      const src = this.pathResolver.join(newRoot, folder)
      const dest = this.pathResolver.join(oldRoot, folder)
      try {
        if (!this.fsReader.directoryExists(src)) {
          // Nothing to move — folder may already be back at oldRoot.
          continue
        }
        this.fsWriter.moveDirectory(src, dest)
      } catch (err) {
        console.error(
          `[klip] migrate_root rollback failed for "${folder}":`,
          redactError(err, oldRoot)
        )
        stranded.push(folder)
      }
    }

    const errorMsg =
      stranded.length === 0
        ? 'Root migration interrupted — folders moved back to original root'
        : `Root migration interrupted — folders moved back, but these are stranded at new root: ${stranded.join(', ')}`
    this.markRolledBack(op.id, errorMsg)
    return false
  }

  /**
   * NOTE: forward-looking placeholder — no use case currently creates
   * `bulk_import` operations. Kept as a defensive default so future bulk-
   * import work has a recovery hook. If a stale row of this type does appear
   * (e.g. left over from a future build), mark it rolled back.
   */
  private recoverBulkImportOp(op: Operation): boolean {
    this.markRolledBack(op.id, 'Bulk import interrupted — rolled back for safety')
    return false
  }

  private markRolledBack(id: string, error: string): void {
    this.operationRepo.updateStatus(id, 'rolled_back', error)
  }
}
