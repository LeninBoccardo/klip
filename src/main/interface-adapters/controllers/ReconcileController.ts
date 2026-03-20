import { ipcMain } from 'electron'
import type { IReconcileDirectory } from '@use-cases/IReconcileDirectory'
import type { ReconcileResult } from '@shared/types'
import { IpcChannels } from '@shared/ipc-channels'

/**
 * IPC controller for the reconciliation feature.
 * Registers `ipcMain.handle('reconcile', ...)`.
 */
export function registerReconcileController(
  reconcileDirectory: IReconcileDirectory,
  rootPath: string
): void {
  ipcMain.handle(IpcChannels.Reconcile, async (): Promise<ReconcileResult> => {
    return reconcileDirectory.execute(rootPath)
  })
}
