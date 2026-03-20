import { initializeDatabase, type DatabaseInstance } from '@main/framework-drivers/database'

/**
 * Creates a fresh in-memory SQLite database with all tables via Drizzle schema push.
 * Each test (or describe block) should call this to get an isolated DB instance.
 *
 * @example
 * ```ts
 * let database: DatabaseInstance
 * beforeEach(() => { database = createTestDb() })
 * afterEach(() => { database.raw.close() })
 * ```
 */
export function createTestDb(): DatabaseInstance {
  return initializeDatabase(':memory:')
}
