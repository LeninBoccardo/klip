import { initializeDatabase } from '@main/framework-drivers/database'

/**
 * Creates a fresh in-memory SQLite database with all migrations applied.
 * Each test (or describe block) should call this to get an isolated DB instance.
 *
 * @example
 * ```ts
 * let db: ReturnType<typeof createTestDb>
 * beforeEach(() => { db = createTestDb() })
 * afterEach(() => { db.close() })
 * ```
 */
export function createTestDb(): ReturnType<typeof initializeDatabase> {
  return initializeDatabase(':memory:')
}
