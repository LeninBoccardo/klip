import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { IUpdater } from '@domain/ports'
import type { UpdaterStatus } from '@shared/types'

/**
 * `electron-updater`–backed implementation of {@link IUpdater}.
 *
 * Translates the underlying `autoUpdater` event stream into a single
 * `UpdaterStatus` snapshot, and notifies subscribers on every transition.
 *
 * Configures `autoDownload = true` and `autoInstallOnAppQuit = true` to
 * match the chosen UX: download in the background, install on quit unless
 * the user explicitly chooses "Restart now" from the toast.
 */
export class ElectronAutoUpdater implements IUpdater {
  private status: UpdaterStatus
  private listeners = new Set<(s: UpdaterStatus) => void>()

  constructor() {
    this.status = {
      state: 'idle',
      currentVersion: app.getVersion(),
      newVersion: null,
      downloadPercent: null,
      errorMessage: null,
      lastCheckedAt: null
    }

    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => {
      this.set({ state: 'checking', errorMessage: null })
    })
    autoUpdater.on('update-available', (info) => {
      this.set({ state: 'available', newVersion: info.version, errorMessage: null })
    })
    autoUpdater.on('update-not-available', (info) => {
      this.set({
        state: 'up-to-date',
        newVersion: null,
        downloadPercent: null,
        errorMessage: null,
        currentVersion: info?.version ?? this.status.currentVersion
      })
    })
    autoUpdater.on('download-progress', (p) => {
      this.set({ state: 'downloading', downloadPercent: Math.round(p.percent) })
    })
    autoUpdater.on('update-downloaded', (info) => {
      this.set({
        state: 'ready',
        newVersion: info.version,
        downloadPercent: 100,
        errorMessage: null
      })
    })
    autoUpdater.on('error', (err) => {
      this.set({ state: 'error', errorMessage: err.message })
    })
  }

  async checkForUpdates(): Promise<void> {
    await autoUpdater.checkForUpdates()
  }

  quitAndInstall(): void {
    autoUpdater.quitAndInstall()
  }

  getStatus(): UpdaterStatus {
    return this.status
  }

  onStatusChange(callback: (status: UpdaterStatus) => void): () => void {
    this.listeners.add(callback)
    return () => {
      this.listeners.delete(callback)
    }
  }

  /** Replace the snapshot and broadcast. Callers pass only the changed fields. */
  private set(partial: Partial<UpdaterStatus>): void {
    const isErrorTransition = partial.state === 'error'
    this.status = {
      ...this.status,
      ...partial,
      lastCheckedAt: isErrorTransition ? this.status.lastCheckedAt : new Date().toISOString()
    }
    for (const listener of this.listeners) listener(this.status)
  }
}

/**
 * Stand-in for development mode, where `electron-updater` is a no-op without
 * `dev-app-update.yml`. Surfaces a `disabled` state so the renderer can render
 * meaningful copy instead of an idle/silent state that never resolves.
 */
export class DisabledUpdater implements IUpdater {
  private readonly status: UpdaterStatus = {
    state: 'disabled',
    currentVersion: app.getVersion(),
    newVersion: null,
    downloadPercent: null,
    errorMessage: null,
    lastCheckedAt: null
  }

  async checkForUpdates(): Promise<void> {
    /* no-op in dev */
  }

  quitAndInstall(): void {
    /* no-op in dev */
  }

  getStatus(): UpdaterStatus {
    return this.status
  }

  onStatusChange(): () => void {
    return () => {
      /* no-op — status never changes */
    }
  }
}
