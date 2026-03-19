import { ipcMain } from 'electron'
import type { IReconcileDirectory, ReconcileResult } from '@use-cases/IReconcileDirectory'

/**
 * IPC controller for the reconciliation feature.
 * Registers `ipcMain.handle('reconcile', ...)`.
 */
export function registerReconcileController(
  reconcileDirectory: IReconcileDirectory,
  rootPath: string
): void {
  ipcMain.handle('reconcile', async (): Promise<ReconcileResult> => {
    return reconcileDirectory.execute(rootPath)
  })
}
