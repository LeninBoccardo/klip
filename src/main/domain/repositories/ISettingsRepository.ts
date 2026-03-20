export interface ISettingsRepository {
  /** Get a setting value by key, or null if not set */
  get(key: string): string | null

  /** Set a setting value (upsert) */
  set(key: string, value: string): void

  /** Get all settings as a key-value record */
  getAll(): Record<string, string>
}
