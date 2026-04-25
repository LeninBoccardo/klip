import type { IReconcileDirectory } from '@use-cases/IReconcileDirectory'
import type { RootPathRef } from '@domain/ports'
import { createTypedHandler } from './create-typed-handler'

/**
 * IPC controller for the reconciliation feature.
 * Registers `ipcMain.handle('reconcile', ...)`.
 */
export function registerReconcileController(
  reconcileDirectory: IReconcileDirectory,
  rootPath: RootPathRef
): void {
  createTypedHandler('reconcile', async () => {
    return reconcileDirectory.execute(rootPath.value)
  })
}
