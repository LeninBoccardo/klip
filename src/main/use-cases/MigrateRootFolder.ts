import type {
  IOperationRepository,
  ISettingsRepository,
  IVideoRepository,
  ICutRepository
} from '@domain/repositories'
import type {
  IFileSystemReader,
  IFileSystemWriter,
  IPathResolver,
  IFileWatcher,
  INotifier,
  IIdGenerator,
  ITransactionScope,
  RootPathRef
} from '@domain/ports'
import type { IReconcileDirectory } from './IReconcileDirectory'
import type { ProcessFileNotifications } from './ProcessFileNotifications'
import type { IMigrateRootFolder } from './IMigrateRootFolder'
import type { MigrateRootResult } from '@shared/types'
import { redactError } from '@domain/types/redact'

/**
 * v2 payload — replaces the legacy `movedSoFar: string[]` shape with explicit
 * per-folder move state so partial rollbacks are recoverable. RecoverOperations
 * still understands the v1 shape for any in-flight migration written by an
 * older build.
 */
interface MigrateRootPayload {
  version: 2
  oldRoot: string
  newRoot: string
  folders: string[]
  moves: Array<{ folder: string; status: 'moved' | 'rolled-back' }>
  /** True when the inline rollback couldn't move every folder back. */
  partial?: boolean
}

/**
 * Migrates all creator folders from the current root to a new root directory.
 *
 * Self-contained rollback: if a folder move fails mid-way, all previously moved
 * folders are moved back to the old root. Per-folder status is persisted so a
 * crash mid-rollback (or a rollback step that itself fails) can be recovered
 * by RecoverOperations on next startup without double-moving anything.
 */
export class MigrateRootFolder implements IMigrateRootFolder {
  constructor(
    private operationRepo: IOperationRepository,
    private settingsRepo: ISettingsRepository,
    private videoRepo: IVideoRepository,
    private cutRepo: ICutRepository,
    private fsReader: IFileSystemReader,
    private fsWriter: IFileSystemWriter,
    private pathResolver: IPathResolver,
    private fileWatcher: IFileWatcher,
    private processNotifications: ProcessFileNotifications,
    private reconcile: IReconcileDirectory,
    private idGenerator: IIdGenerator,
    private notifier: INotifier,
    private rootPathRef: RootPathRef,
    private transaction: ITransactionScope
  ) {}

  async execute(newRootPath: string): Promise<MigrateRootResult> {
    const oldRootPath = this.settingsRepo.get('rootPath')
    if (!oldRootPath) {
      return { success: false, movedCount: 0, error: 'No current root path configured' }
    }

    // ── Validation ──
    if (oldRootPath === newRootPath) {
      return { success: false, movedCount: 0, error: 'New root is the same as the current root' }
    }

    if (!this.fsReader.directoryExists(oldRootPath)) {
      return { success: false, movedCount: 0, error: 'Current root directory does not exist' }
    }

    // If new root exists, it must be empty
    if (this.fsReader.directoryExists(newRootPath)) {
      if (!this.fsWriter.isDirectoryEmpty(newRootPath)) {
        return {
          success: false,
          movedCount: 0,
          error: 'Target directory is not empty. Please select an empty folder or a new path.'
        }
      }
    } else {
      // Auto-create if it doesn't exist
      this.fsWriter.ensureDirectory(newRootPath)
    }

    // ── Suspend watcher (await to ensure no flush is mid-flight) ──
    await this.processNotifications.suspend()
    await this.fileWatcher.stop()
    // Tracks whether a recovery path (rollback / restart-on-error / success)
    // has already restored watcher state. The outer finally uses this to
    // guarantee resume() runs even if an unexpected error fires before any
    // explicit recovery branch (e.g. operationRepo.create throws).
    let watcherRestored = false

    try {
      // ── Gather folders to move ──
      const folders = this.fsReader.listDirectories(oldRootPath)
      const operationId = this.idGenerator.generate()
      const payload: MigrateRootPayload = {
        version: 2,
        oldRoot: oldRootPath,
        newRoot: newRootPath,
        folders,
        moves: []
      }

      // ── Create operation record (already in_progress so startedAt is recorded) ──
      const now = new Date().toISOString()
      this.operationRepo.create({
        id: operationId,
        type: 'migrate_root',
        status: 'in_progress',
        payload: JSON.stringify(payload),
        error: null,
        startedAt: now,
        completedAt: null,
        createdAt: now
      })

      // ── Move folders one by one ──
      try {
        for (let i = 0; i < folders.length; i++) {
          const folder = folders[i]
          const srcPath = this.pathResolver.join(oldRootPath, folder)
          const destPath = this.pathResolver.join(newRootPath, folder)

          this.notifier.notify('migrate-root-progress', {
            phase: 'moving',
            current: i + 1,
            total: folders.length,
            currentFolder: folder
          })

          this.fsWriter.moveDirectory(srcPath, destPath)

          payload.moves.push({ folder, status: 'moved' })
          this.operationRepo.updatePayload(operationId, JSON.stringify(payload))
        }
      } catch (moveError) {
        // ── Inline rollback: move everything back ──
        const errorMsg =
          moveError instanceof Error ? moveError.message : 'Unknown error during folder move'

        // `movedCount` reports forward-move progress before the failure, not
        // post-rollback state — `moves.length` captures every folder that
        // reached newRoot (whether the rollback later returned it or not).
        const movedBeforeFailure = payload.moves.length
        await this.rollbackMovedFolders(payload, operationId, errorMsg)
        watcherRestored = true

        return {
          success: false,
          movedCount: movedBeforeFailure,
          error: errorMsg
        }
      }

      // ── Update DB paths (atomic: all-or-nothing) ──
      try {
        this.notifier.notify('migrate-root-progress', {
          phase: 'updating_db',
          current: 0,
          total: 1
        })

        this.transaction.run(() => {
          this.videoRepo.updateFilePathPrefix(oldRootPath, newRootPath)
          this.cutRepo.updateFilePathPrefix(oldRootPath, newRootPath)
          this.settingsRepo.set('rootPath', newRootPath)
          // Mark the operation terminal INSIDE the same transaction as the
          // path rewrite. Otherwise a hard kill in the (synchronous) gap before
          // a separate updateStatus('completed') would leave the op
          // 'in_progress' while the DB already points at newRoot — and
          // RecoverOperations would then move every folder back to oldRoot,
          // un-doing a successful migration (mass "missing" library). (F02)
          this.operationRepo.updateStatus(operationId, 'completed')
        })
        // Mutate the in-memory ref only after the DB writes commit.
        this.rootPathRef.value = newRootPath
      } catch (dbError) {
        // The path-rewrite transaction is atomic, so on failure the DB
        // (filePaths + rootPath) is rolled back to oldRoot — but the folders are
        // physically at newRoot. Previously we marked the op terminally 'failed'
        // and left the files at newRoot: every entity then resolved to oldRoot
        // where nothing exists (whole library reads as "missing") with no
        // recovery path, since 'failed' ops are never revisited. Instead, move
        // the folders back to oldRoot so disk matches the DB. rollbackMovedFolders
        // restarts the watcher on oldRoot and resumes notifications. (F11)
        const errorMsg =
          dbError instanceof Error ? dbError.message : 'Unknown error during DB update'
        await this.rollbackMovedFolders(payload, operationId, errorMsg)
        watcherRestored = true
        return {
          success: false,
          movedCount: folders.length,
          error: `DB update failed; folders rolled back to the original root: ${errorMsg}`
        }
      }

      // ── Complete ── (status already committed atomically in the
      // transaction above; from here on a crash is harmless — recovery sees a
      // 'completed' op and skips it.)

      // ── Restart watcher on new root ──
      await this.fileWatcher.restart(newRootPath)
      await this.processNotifications.resume()
      watcherRestored = true

      // ── Reconcile ──
      this.notifier.notify('migrate-root-progress', {
        phase: 'reconciling',
        current: 0,
        total: 1
      })
      this.reconcile.execute(newRootPath)

      this.notifier.notify('db-updated', { scope: ['all'] })

      return { success: true, movedCount: folders.length }
    } finally {
      // Safety net: if anything between suspend and the recovery branches threw
      // (e.g. operationRepo.create failing before any catch block was reached),
      // make sure the watcher is back online so the app stays usable.
      if (!watcherRestored) {
        try {
          await this.fileWatcher.restart(oldRootPath)
        } catch (err) {
          console.error(
            '[klip] Failed to restart watcher after migrate failure:',
            redactError(err, oldRootPath)
          )
        }
        try {
          await this.processNotifications.resume()
        } catch (err) {
          console.error(
            '[klip] Failed to resume notifications after migrate failure:',
            redactError(err, oldRootPath)
          )
        }
      }
    }
  }

  /**
   * Moves all 'moved' entries back to the old root. Per-folder status flips
   * to 'rolled-back' on success and is persisted between steps so a crash or
   * a per-folder failure leaves the operation in a state RecoverOperations
   * can resume idempotently. If at least one folder couldn't be moved back,
   * `payload.partial` is set so RecoverOperations can pick up the leftovers.
   *
   * Emits `phase: 'rolling_back'` progress events so the renderer's blocking
   * dialog can communicate that we're backtracking — otherwise it would still
   * show "moving" while files travel in reverse.
   */
  private async rollbackMovedFolders(
    payload: MigrateRootPayload,
    operationId: string,
    error: string
  ): Promise<void> {
    const pending = payload.moves.filter((m) => m.status === 'moved')
    const total = pending.length
    let stranded = 0

    for (let i = 0; i < total; i++) {
      const move = pending[i]
      this.notifier.notify('migrate-root-progress', {
        phase: 'rolling_back',
        current: i + 1,
        total,
        currentFolder: move.folder
      })
      try {
        const destPath = this.pathResolver.join(payload.newRoot, move.folder)
        const srcPath = this.pathResolver.join(payload.oldRoot, move.folder)
        this.fsWriter.moveDirectory(destPath, srcPath)
        move.status = 'rolled-back'
      } catch (rollbackErr) {
        console.error(
          `[klip] Rollback failed for folder "${move.folder}":`,
          redactError(rollbackErr, payload.newRoot)
        )
        stranded += 1
      }
      // Persist progress after each step so a crash mid-rollback can be
      // resumed by RecoverOperations without re-attempting succeeded moves.
      this.operationRepo.updatePayload(operationId, JSON.stringify(payload))
    }

    if (stranded > 0) {
      payload.partial = true
      this.operationRepo.updatePayload(operationId, JSON.stringify(payload))
    }

    this.operationRepo.updateStatus(operationId, 'failed', error)
    await this.fileWatcher.restart(payload.oldRoot)
    await this.processNotifications.resume()
  }
}
