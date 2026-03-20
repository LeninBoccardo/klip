import { eq, sql } from 'drizzle-orm'
import type { AppDatabase } from '@main/framework-drivers/database'
import { settings } from '@main/framework-drivers/database/schema'
import type { ISettingsRepository } from '@domain/repositories'

export class SqliteSettingsRepository implements ISettingsRepository {
  constructor(private db: AppDatabase) {}

  get(key: string): string | null {
    const row = this.db.select().from(settings).where(eq(settings.key, key)).get()
    return row?.value ?? null
  }

  set(key: string, value: string): void {
    this.db
      .insert(settings)
      .values({ key, value, updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          value: sql`excluded.value`,
          updatedAt: sql`excluded.updated_at`
        }
      })
      .run()
  }

  getAll(): Record<string, string> {
    const rows = this.db.select().from(settings).all()
    const result: Record<string, string> = {}
    for (const row of rows) {
      result[row.key] = row.value
    }
    return result
  }
}
