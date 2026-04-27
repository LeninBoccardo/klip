import type { UpdaterStatus } from '@shared/types'

/**
 * Abstraction over the desktop auto-updater.
 *
 * Implementations check for updates against a remote source, download new
 * versions in the background, and expose status changes via subscription.
 *
 * Status flow under normal operation:
 *   idle → checking → (available → downloading → ready) | up-to-date
 */
export interface IUpdater {
  /** Trigger a check; downloads automatically if an update is available. */
  checkForUpdates(): Promise<void>

  /** Quit the app and install a previously downloaded update. */
  quitAndInstall(): void

  /** Snapshot of the current status. */
  getStatus(): UpdaterStatus

  /**
   * Subscribe to status transitions. Returns an unsubscribe function.
   * The callback is invoked synchronously after each state change.
   */
  onStatusChange(callback: (status: UpdaterStatus) => void): () => void
}
