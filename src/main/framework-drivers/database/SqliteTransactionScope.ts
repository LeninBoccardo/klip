import type BetterSqlite3 from 'better-sqlite3'
import type { ITransactionScope } from '@domain/ports'

/**
 * SQLite-backed transaction scope using better-sqlite3's `transaction()`.
 * Wraps a synchronous function in BEGIN/COMMIT, rolls back on throw.
 */
export class SqliteTransactionScope implements ITransactionScope {
  constructor(private db: BetterSqlite3.Database) {}

  run<T>(fn: () => T): T {
    return this.db.transaction(fn)()
  }
}
