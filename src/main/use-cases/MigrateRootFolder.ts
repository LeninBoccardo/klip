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

interface MigrateRootPayload {
  oldRoot: string
  newRoot: string
  folders: string[]
  movedSoFar: string[]
}

/**
 * Migrates all creator folders from the current root to a new root directory.
 *
 * Self-contained rollback: if a folder move fails mid-way, all previously moved
 * folders are moved back to the old root. The operations table logs the attempt
 * for audit purposes only — RecoverOperations is not involved.
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
        oldRoot: oldRootPath,
        newRoot: newRootPath,
        folders,
        movedSoFar: []
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

          payload.movedSoFar.push(folder)
          this.operationRepo.updatePayload(operationId, JSON.stringify(payload))
        }
      } catch (moveError) {
        // ── Inline rollback: move everything back ──
        const errorMsg =
          moveError instanceof Error ? moveError.message : 'Unknown error during folder move'

        await this.rollbackMovedFolders(payload, operationId, errorMsg)
        watcherRestored = true

        return { success: false, movedCount: payload.movedSoFar.length, error: errorMsg }
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
        })
        // Mutate the in-memory ref only after the DB writes commit.
        this.rootPathRef.value = newRootPath
      } catch (dbError) {
        // DB update failed after all folders moved — this is a critical state.
        // Mark operation failed but don't roll back files (they're already moved).
        const errorMsg =
          dbError instanceof Error ? dbError.message : 'Unknown error during DB update'
        this.operationRepo.updateStatus(operationId, 'failed', errorMsg)
        await this.fileWatcher.restart(newRootPath)
        await this.processNotifications.resume()
        watcherRestored = true
        return {
          success: false,
          movedCount: folders.length,
          error: `Files moved but DB update failed: ${errorMsg}`
        }
      }

      // ── Complete ──
      this.operationRepo.updateStatus(operationId, 'completed')

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
   * Moves all previously-moved folders back to the old root,
   * then restarts the watcher on the old root.
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
    const total = payload.movedSoFar.length
    for (let i = 0; i < total; i++) {
      const folder = payload.movedSoFar[i]
      this.notifier.notify('migrate-root-progress', {
        phase: 'rolling_back',
        current: i + 1,
        total,
        currentFolder: folder
      })
      try {
        const destPath = this.pathResolver.join(payload.newRoot, folder)
        const srcPath = this.pathResolver.join(payload.oldRoot, folder)
        this.fsWriter.moveDirectory(destPath, srcPath)
      } catch (rollbackErr) {
        console.error(
          `[klip] Rollback failed for folder "${folder}":`,
          redactError(rollbackErr, payload.newRoot)
        )
      }
    }

    this.operationRepo.updateStatus(operationId, 'failed', error)
    await this.fileWatcher.restart(payload.oldRoot)
    await this.processNotifications.resume()
  }
}
