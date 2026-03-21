import type { IReconcileDirectory } from '@use-cases/IReconcileDirectory'
import { createTypedHandler } from './create-typed-handler'

/**
 * IPC controller for the reconciliation feature.
 * Registers `ipcMain.handle('reconcile', ...)`.
 */
export function registerReconcileController(
  reconcileDirectory: IReconcileDirectory,
  rootPath: string
): void {
  createTypedHandler('reconcile', async () => {
    return reconcileDirectory.execute(rootPath)
  })
}
