import type { ISettingsRepository } from '@domain/repositories'
import { createTypedHandler } from './create-typed-handler'

/**
 * IPC controller for application settings.
 *
 * Registers:
 *   - `get-settings` → get all settings as key-value record
 *   - `get-setting`  → get a single setting by key
 *   - `set-setting`  → set a single setting (upsert)
 */
export function registerSettingsController(settingsRepo: ISettingsRepository): void {
  createTypedHandler('get-settings', async () => {
    return settingsRepo.getAll()
  })

  createTypedHandler('get-setting', async (_event, key) => {
    return settingsRepo.get(key)
  })

  createTypedHandler('set-setting', async (_event, key, value) => {
    settingsRepo.set(key, value)
  })
}
