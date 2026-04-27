import type { IUpdater } from '@domain/ports'
import { createTypedHandler } from './create-typed-handler'

/**
 * IPC controller for the auto-updater.
 *
 * Registers:
 *   - `check-for-updates`   → triggers a check; returns latest status
 *   - `install-update`      → quits and installs a downloaded update
 *   - `get-updater-status`  → snapshot of the current state
 *
 * Live status transitions are streamed to the renderer separately via the
 * `updater-status` push channel (wired in composition root through INotifier).
 */
export function registerUpdaterController(updater: IUpdater): void {
  createTypedHandler('check-for-updates', async () => {
    await updater.checkForUpdates()
    return updater.getStatus()
  })

  createTypedHandler('install-update', async () => {
    updater.quitAndInstall()
  })

  createTypedHandler('get-updater-status', async () => updater.getStatus())
}
