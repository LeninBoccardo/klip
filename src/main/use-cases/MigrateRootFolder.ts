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
  IIdGenerator
} from '@domain/ports'
import type { IReconcileDirectory } from './IReconcileDirectory'
import type { ProcessFileNotifications } from './ProcessFileNotifications'
import type { IMigrateRootFolder } from './IMigrateRootFolder'
import type { MigrateRootResult } from '@shared/types'

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
    private notifier: INotifier
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

    // ── Suspend watcher ──
    this.processNotifications.suspend()
    this.fileWatcher.stop()

    // ── Gather folders to move ──
    const folders = this.fsReader.listDirectories(oldRootPath)
    const operationId = this.idGenerator.generate()
    const payload: MigrateRootPayload = {
      oldRoot: oldRootPath,
      newRoot: newRootPath,
      folders,
      movedSoFar: []
    }

    // ── Create operation record ──
    this.operationRepo.create({
      id: operationId,
      type: 'migrate_root',
      status: 'pending',
      payload: JSON.stringify(payload),
      error: null,
      startedAt: null,
      completedAt: null,
      createdAt: new Date().toISOString()
    })
    this.operationRepo.updateStatus(operationId, 'in_progress')

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

      return { success: false, movedCount: payload.movedSoFar.length, error: errorMsg }
    }

    // ── Update DB paths ──
    try {
      this.notifier.notify('migrate-root-progress', {
        phase: 'updating_db',
        current: 0,
        total: 1
      })

      this.videoRepo.updateFilePathPrefix(oldRootPath, newRootPath)
      this.cutRepo.updateFilePathPrefix(oldRootPath, newRootPath)
      this.settingsRepo.set('rootPath', newRootPath)
    } catch (dbError) {
      // DB update failed after all folders moved — this is a critical state.
      // Mark operation failed but don't roll back files (they're already moved).
      const errorMsg =
        dbError instanceof Error ? dbError.message : 'Unknown error during DB update'
      this.operationRepo.updateStatus(operationId, 'failed', errorMsg)
      this.fileWatcher.restart(newRootPath)
      this.processNotifications.resume()
      return {
        success: false,
        movedCount: folders.length,
        error: `Files moved but DB update failed: ${errorMsg}`
      }
    }

    // ── Complete ──
    this.operationRepo.updateStatus(operationId, 'completed')

    // ── Restart watcher on new root ──
    this.fileWatcher.restart(newRootPath)
    this.processNotifications.resume()

    // ── Reconcile ──
    this.notifier.notify('migrate-root-progress', {
      phase: 'reconciling',
      current: 0,
      total: 1
    })
    this.reconcile.execute(newRootPath)

    this.notifier.notify('db-updated')

    return { success: true, movedCount: folders.length }
  }

  /**
   * Moves all previously-moved folders back to the old root,
   * then restarts the watcher on the old root.
   */
  private async rollbackMovedFolders(
    payload: MigrateRootPayload,
    operationId: string,
    error: string
  ): Promise<void> {
    for (const folder of payload.movedSoFar) {
      try {
        const destPath = this.pathResolver.join(payload.newRoot, folder)
        const srcPath = this.pathResolver.join(payload.oldRoot, folder)
        this.fsWriter.moveDirectory(destPath, srcPath)
      } catch (rollbackErr) {
        console.error(`[klip] Rollback failed for folder "${folder}":`, rollbackErr)
      }
    }

    this.operationRepo.updateStatus(operationId, 'failed', error)
    this.fileWatcher.restart(payload.oldRoot)
    this.processNotifications.resume()
  }
}



