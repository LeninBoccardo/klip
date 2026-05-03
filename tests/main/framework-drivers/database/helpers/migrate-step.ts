import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join } from 'path'

export const MIGRATIONS_DIR = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'src',
  'main',
  'framework-drivers',
  'database',
  'migrations'
)

/**
 * Splits a Drizzle-generated migration on the `--> statement-breakpoint`
 * marker (Drizzle uses this to delimit statements that better-sqlite3
 * can't run via a single `.exec()` because they contain CREATE TRIGGER
 * `BEGIN ... END;` blocks). Each statement is trimmed and empty entries
 * are dropped.
 */
export function splitMigration(sql: string): string[] {
  return sql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * Read a single migration `.sql` file by its filename (without directory)
 * and apply it to the supplied raw SQLite handle. Throws on the first
 * statement that fails so the migration is bisect-friendly.
 */
export function applyMigrationFile(raw: BetterSqlite3.Database, fileName: string): void {
  const sql = readFileSync(join(MIGRATIONS_DIR, fileName), 'utf-8')
  for (const statement of splitMigration(sql)) {
    raw.exec(statement)
  }
}

/**
 * Apply migrations 0000–{upTo} (inclusive) in order. Used to seed a partial
 * schema when testing a specific migration's data-shape behaviour.
 */
export function applyMigrationsUpTo(
  raw: BetterSqlite3.Database,
  upTo: string,
  files: readonly string[]
): void {
  const sorted = [...files].sort()
  for (const file of sorted) {
    applyMigrationFile(raw, file)
    if (file === upTo) return
  }
  throw new Error(`Target migration "${upTo}" not found in supplied list`)
}
