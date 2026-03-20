import { ipcMain } from 'electron'
import type { ISettingsRepository } from '@domain/repositories'
import { IpcChannels } from '@shared/ipc-channels'

/**
 * IPC controller for application settings.
 *
 * Registers:
 *   - `get-settings` → get all settings as key-value record
 *   - `get-setting`  → get a single setting by key
 *   - `set-setting`  → set a single setting (upsert)
 */
export function registerSettingsController(settingsRepo: ISettingsRepository): void {
  ipcMain.handle(IpcChannels.GetSettings, async (): Promise<Record<string, string>> => {
    return settingsRepo.getAll()
  })

  ipcMain.handle(IpcChannels.GetSetting, async (_event, key: string): Promise<string | null> => {
    return settingsRepo.get(key)
  })

  ipcMain.handle(
    IpcChannels.SetSetting,
    async (_event, key: string, value: string): Promise<void> => {
      settingsRepo.set(key, value)
    }
  )
}
