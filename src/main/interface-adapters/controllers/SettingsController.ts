import { dialog, BrowserWindow } from 'electron'
import type { ISettingsRepository } from '@domain/repositories'
import type { IMigrateRootFolder } from '@use-cases/IMigrateRootFolder'
import { createTypedHandler } from './create-typed-handler'

/**
 * IPC controller for application settings.
 *
 * Registers:
 *   - `get-settings`   → get all settings as key-value record
 *   - `get-setting`    → get a single setting by key
 *   - `set-setting`    → set a single setting (upsert)
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
    settingsRepo.set(key, value)
  })

  createTypedHandler('migrate-root', async (_event, newRootPath) => {
    return migrateRootFolder.execute(newRootPath)
  })

  createTypedHandler('select-folder', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) {
      return null
    }
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select new root folder'
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })
}
