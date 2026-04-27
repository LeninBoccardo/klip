/**
 * Lifecycle states for the auto-updater.
 *
 * `disabled` is set when running in development — `electron-updater` is a
 * no-op without `dev-app-update.yml`, so we surface that explicitly.
 */
export type UpdaterState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'up-to-date'
  | 'error'
  | 'disabled'

/** Renderer-facing snapshot of the auto-updater. */
export interface UpdaterStatus {
  state: UpdaterState
  currentVersion: string
  /** Set when `state` is `available` | `downloading` | `ready`. */
  newVersion: string | null
  /** Integer 0–100 when `state === 'downloading'`. */
  downloadPercent: number | null
  /** Set when `state === 'error'`. */
  errorMessage: string | null
  /** ISO timestamp of last non-error transition. */
  lastCheckedAt: string | null
}
