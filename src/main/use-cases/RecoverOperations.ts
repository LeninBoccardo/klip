import { z } from 'zod'
import type {
  ICutRepository,
  IOperationRepository,
  ISettingsRepository
} from '@domain/repositories'
import type { IFileSystemReader, IFileSystemWriter, IPathResolver } from '@domain/ports'
import type { Operation } from '@domain/entities'
import { redactError } from '@domain/types/redact'
import type { IRecoverOperations, RecoverResult } from './IRecoverOperations'
import { renderCutOpPayloadSchema } from './RenderCutFromVideo'

// Operation payloads are stored as JSON strings in `operations.payload`. A
// tampered or partially-written row (e.g. from a crash mid-write or future
// schema change) must not crash recovery — every parse goes through a zod
// schema and an unparseable row gets rolled back with a clear error.
const renameFolderPayloadSchema = z.object({
  oldPath: z.string().min(1),
  newPath: z.string().min(1)
})

const migrateRootPayloadV1Schema = z.object({
  oldRoot: z.string().min(1),
  newRoot: z.string().min(1),
  movedSoFar: z.array(z.string())
})

const migrateRootPayloadV2Schema = z.object({
  version: z.literal(2),
  oldRoot: z.string().min(1),
  newRoot: z.string().min(1),
  folders: z.array(z.string()),
  moves: z.array(
    z.object({
      folder: z.string().min(1),
      status: z.enum(['moved', 'rolled-back'])
    })
  ),
  partial: z.boolean().optional()
})

const migrateRootPayloadSchema = z.union([migrateRootPayloadV2Schema, migrateRootPayloadV1Schema])

// Render-cut payload schema is the single source of truth in
// `RenderCutFromVideo.ts` (`renderCutOpPayloadSchema`); imported above so
// the writer + reader cannot drift out of sync.

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
 *   - `migrate_root`: replay the moves payload in reverse and physically move
 *     each folder back from new root → old root, then mark rolled_back. Best-
 *     effort per folder; per-folder status is persisted between steps so a
 *     second crash leaves a resumable state. v2 payloads carry explicit per-
 *     folder status (`moved` / `rolled-back`) so already-rolled-back folders
 *     are skipped without relying on filesystem inspection alone.
 *   - `bulk_import`: always mark rolled_back (no partial recovery).
 */
export class RecoverOperations implements IRecoverOperations {
  constructor(
    private operationRepo: IOperationRepository,
    private fsReader: IFileSystemReader,
    private fsWriter: IFileSystemWriter,
    private pathResolver: IPathResolver,
    private cutRepo: ICutRepository,
    private settingsRepo: ISettingsRepository
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
      case 'render_cut':
        return this.recoverRenderCutOp(op)
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
          : 'Malformed migrate_root payload (missing oldRoot/newRoot/moves)'
      )
      return false
    }

    const payload = result.value

    // Idempotency guard (F02): if the DB already points at newRoot, the
    // migration's path-rewrite transaction committed — files belong at newRoot
    // and the only thing left undone was a post-commit step (e.g. the op-status
    // write, watcher restart, or reconcile). Rolling the folders back here would
    // actively un-do a successful migration and leave the entire library
    // "missing". Treat it as completed instead.
    if (this.settingsRepo.get('rootPath') === payload.newRoot) {
      this.operationRepo.updateStatus(op.id, 'completed')
      return true
    }

    // Normalise both schemas into a single { oldRoot, newRoot, moves } shape.
    // `'moves' in payload` is the v2/v1 discriminator: only v2 carries explicit
    // per-folder status, so a v1 payload (legacy `movedSoFar: string[]`) is
    // upgraded into the same shape with status='moved' so the rest of the
    // recovery loop is uniform.
    const moves: Array<{ folder: string; status: 'moved' | 'rolled-back' }> =
      'moves' in payload
        ? payload.moves
        : payload.movedSoFar.map((folder) => ({ folder, status: 'moved' as const }))
    const folders: string[] = 'folders' in payload ? payload.folders : moves.map((m) => m.folder)
    const oldRoot = payload.oldRoot
    const newRoot = payload.newRoot

    const stranded: string[] = []
    for (const move of moves) {
      if (move.status === 'rolled-back') continue
      const src = this.pathResolver.join(newRoot, move.folder)
      const dest = this.pathResolver.join(oldRoot, move.folder)
      try {
        if (!this.fsReader.directoryExists(src)) {
          // Source missing at newRoot — folder was already rolled back manually
          // or never made it. Either way, treat as recovered.
          move.status = 'rolled-back'
          continue
        }
        this.fsWriter.moveDirectory(src, dest)
        move.status = 'rolled-back'
      } catch (err) {
        console.error(
          `[klip] migrate_root rollback failed for "${move.folder}":`,
          redactError(err, oldRoot)
        )
        stranded.push(move.folder)
      }
      // Persist after each step so a second crash leaves a resumable state.
      this.operationRepo.updatePayload(
        op.id,
        JSON.stringify({
          version: 2,
          oldRoot,
          newRoot,
          folders,
          moves,
          partial: stranded.length > 0
        })
      )
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

  /**
   * Recover an interrupted editor render. Two distinct scenarios share
   * this code path because both leave the operation row in a non-terminal
   * state on next launch:
   *
   *   (a) Crash before the rename — `stagingPath` may hold a partial mp4,
   *       `finalPath` doesn't exist, the Cut row is orphan-pending. We
   *       delete the staging file, the Cut row, and the empty cut dir,
   *       then mark the op rolled-back.
   *
   *   (b) Crash *after* rename but *before* `updateStatus('completed')`
   *       — `finalPath` exists with a valid file, the Cut row is real,
   *       and rolling back would destroy the user's successful cut
   *       (HP-1). Detect this by checking `fileExists(finalPath)` and
   *       mark the op `completed` instead.
   *
   * Sidecar parity in case (b): the `cut-data.json` may or may not have
   * been written depending on which sub-step crashed. Reconcile-aware
   * read-back tolerates a missing sidecar (the recipe lives on the Cut
   * row's `editRecipeJson` column too), so we don't try to rewrite it
   * here — the row is the source of truth.
   */
  private recoverRenderCutOp(op: Operation): boolean {
    const result = parsePayload(op.payload, renderCutOpPayloadSchema)
    if (!result.ok) {
      this.markRolledBack(
        op.id,
        result.reason === 'parse-error'
          ? 'Failed to parse render_cut payload — manual cleanup required'
          : 'Malformed render_cut payload (missing cutId/stagingPath)'
      )
      return false
    }

    const { cutId, stagingPath, finalPath, cutDir } = result.value

    // HP-1: detect "render finished but op not marked completed" — the
    // file at finalPath is the user's successful cut. Any cleanup here
    // would silently destroy it.
    if (this.fsReader.fileExists(finalPath)) {
      // Best-effort: remove the staging file in case it was renamed but
      // a copy lingered (cross-device fallback edge cases).
      try {
        this.fsWriter.deleteFile(stagingPath)
      } catch {
        // ignored — orphan staging file at worst, doesn't affect the
        // user-visible cut.
      }
      this.operationRepo.updateStatus(op.id, 'completed')
      return true
    }

    try {
      this.fsWriter.deleteFile(stagingPath)
    } catch (err) {
      console.warn(
        `[klip] render_cut recovery: failed to delete staging file:`,
        err instanceof Error ? err.message : err
      )
    }

    try {
      this.cutRepo.delete(cutId)
    } catch (err) {
      console.warn(
        `[klip] render_cut recovery: failed to delete orphan Cut row:`,
        err instanceof Error ? err.message : err
      )
    }

    // HP-2: remove the orphan `<creator>/cuts/<cutId>/` shell so the
    // next reconcile sweep doesn't re-discover it as a phantom row.
    try {
      this.fsWriter.removeDirectoryIfEmpty(cutDir)
    } catch (err) {
      console.warn(
        `[klip] render_cut recovery: failed to remove orphan cut dir:`,
        err instanceof Error ? err.message : err
      )
    }

    this.markRolledBack(op.id, 'Render interrupted — partial output and orphan row cleaned up')
    return false
  }

  private markRolledBack(id: string, error: string): void {
    this.operationRepo.updateStatus(id, 'rolled_back', error)
  }
}
