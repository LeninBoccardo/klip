import { ipcMain } from 'electron'
import type { ReconcileDirectory, ReconcileResult } from '@use-cases/ReconcileDirectory'

/**
 * IPC controller for the reconciliation feature.
 * Registers `ipcMain.handle('reconcile', ...)`.
 */
export function registerReconcileController(
  reconcileDirectory: ReconcileDirectory,
  rootPath: string
): void {
  ipcMain.handle('reconcile', async (): Promise<ReconcileResult> => {
    return reconcileDirectory.execute(rootPath)
  })
}
