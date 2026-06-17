import type { IReconcileDirectory, ReconcileResult } from '@use-cases/IReconcileDirectory'
import type { RootPathRef, INotifier } from '@domain/ports'
import { createTypedHandler } from './create-typed-handler'

/** True when a reconcile pass changed at least one entity. */
function reconcileChangedAnything(r: ReconcileResult): boolean {
  return (
    r.creatorsAdded > 0 ||
    r.creatorsMarkedMissing > 0 ||
    r.creatorsRecovered > 0 ||
    r.videosAdded > 0 ||
    r.videosMarkedMissing > 0 ||
    r.videosRecovered > 0 ||
    r.cutsAdded > 0 ||
    r.cutsMarkedMissing > 0 ||
    r.cutsRecovered > 0
  )
}

/**
 * IPC controller for the reconciliation feature.
 * Registers `ipcMain.handle('reconcile', ...)`.
 */
export function registerReconcileController(
  reconcileDirectory: IReconcileDirectory,
  rootPath: RootPathRef,
  notifier: INotifier
): void {
  createTypedHandler('reconcile', async () => {
    const result = reconcileDirectory.execute(rootPath.value)
    // The manual reconcile (Settings → Run reconcile) is the only reconcile
    // entry point with no downstream db-updated push — unlike the chokidar and
    // migrate paths, which notify after their reconcile. Without this, the
    // result card reports e.g. "videosAdded: 5" while every list, the dashboard
    // stats, search and tags keep serving pre-reconcile cache until an unrelated
    // FS event or a window reload. Push a full invalidation when anything
    // actually changed. (F13)
    if (reconcileChangedAnything(result)) {
      notifier.notify('db-updated', { scope: ['all'] })
    }
    return result
  })
}
