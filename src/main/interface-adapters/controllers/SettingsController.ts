import { dialog, BrowserWindow } from 'electron'
import type { ISettingsRepository } from '@domain/repositories'
import type { IMigrateRootFolder } from '@use-cases/IMigrateRootFolder'
import { createTypedHandler } from './create-typed-handler'

/**
 * Settings keys the renderer is allowed to write directly via `set-setting`.
 *
 * `rootPath` is intentionally excluded — changing it requires the
 * `MigrateRootFolder` saga (file moves + DB path rewrites + watcher restart)
 * and cannot be done with a bare value swap. A renderer that wrote it
 * directly would silently break every entity's `filePath` and the file
 * watcher's root.
 *
 * Add new keys here as they are introduced.
 */
const SETTABLE_KEYS = new Set<string>([
  // No keys are settable yet via this generic endpoint. Add as needed.
])

/**
 * IPC controller for application settings.
 *
 * Registers:
 *   - `get-settings`   → get all settings as key-value record
 *   - `get-setting`    → get a single setting by key
 *   - `set-setting`    → set a single setting (allowlisted keys only)
 *   - `migrate-root`   → migrate root folder to a new path
 *   - `select-folder`  → open native folder picker dialog
 */
export function registerSettingsController(
  settingsRepo: ISettingsRepository,
  migrateRootFolder: IMigrateRootFolder
): void {
  createTypedHandler('get-settings', async () => {
    return settingsRepo.getAll()
  })

  createTypedHandler('get-setting', async (_event, key) => {
    return settingsRepo.get(key)
  })

  createTypedHandler('set-setting', async (_event, key, value) => {
    if (!SETTABLE_KEYS.has(key)) {
      throw new Error(
        `Setting "${key}" is not user-writable via set-setting. ` +
          `(rootPath: use migrate-root instead.)`
      )
    }
    settingsRepo.set(key, value)
  })

  createTypedHandler('migrate-root', async (_event, newRootPath) => {
    return migrateRootFolder.execute(newRootPath)
  })

  createTypedHandler('select-folder', async (event) => {
    // Resolve the calling window from the IPC sender rather than the focused
    // window. Prevents the dialog from silently failing when a system
    // notification or other app briefly steals focus between click and IPC.
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) {
      return null
    }
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select new root folder'
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })
}
