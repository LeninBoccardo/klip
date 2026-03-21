import BetterSqlite3 from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { sql } from 'drizzle-orm'
import * as schema from './schema'
import { join } from 'path'

export type AppDatabase = BetterSQLite3Database<typeof schema>

export interface DatabaseInstance {
  /** Raw better-sqlite3 handle — used for transactions and shutdown */
  raw: BetterSqlite3.Database
  /** Drizzle ORM instance — used by all repositories */
  db: AppDatabase
}

/**
 * Open (or create) the SQLite database at `dbPath`, enable WAL mode and
 * foreign keys, wrap with Drizzle, and apply all pending migrations.
 *
 * For in-memory databases (`:memory:`), schema is pushed directly
 * since file-based migrations are not available.
 */
export function initializeDatabase(dbPath: string): DatabaseInstance {
  const raw = new BetterSqlite3(dbPath)

  raw.pragma('journal_mode = WAL')
  raw.pragma('foreign_keys = ON')

  const db = drizzle(raw, { schema })

  if (dbPath === ':memory:') {
    pushSchema(db)
  } else {
    const migrationsFolder = join(__dirname, 'migrations')
    migrate(db, { migrationsFolder })
  }

  return { raw, db }
}

/**
 * Push schema directly to an in-memory database.
 * Used by test helpers — avoids needing migration files on disk.
 */
function pushSchema(db: AppDatabase): void {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS creators (
      id TEXT PRIMARY KEY,
      folder_name TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      profile_image_path TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.run(sql`
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      creator_id TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      url TEXT,
      duration INTEGER,
      resolution TEXT,
      file_size INTEGER,
      file_path TEXT NOT NULL,
      thumbnail_path TEXT,
      download_date TEXT,
      probe_status TEXT NOT NULL DEFAULT 'pending',
      status TEXT NOT NULL DEFAULT 'active',
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.run(sql`
    CREATE TABLE IF NOT EXISTS cuts (
      id TEXT PRIMARY KEY,
      creator_id TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      video_id TEXT REFERENCES videos(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      start_timestamp REAL,
      end_timestamp REAL,
      duration INTEGER,
      resolution TEXT,
      file_size INTEGER,
      file_path TEXT NOT NULL,
      thumbnail_path TEXT,
      probe_status TEXT NOT NULL DEFAULT 'pending',
      status TEXT NOT NULL DEFAULT 'active',
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.run(sql`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.run(sql`
    CREATE TABLE IF NOT EXISTS operations (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payload TEXT NOT NULL DEFAULT '{}',
      error TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.run(sql`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      changes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // Indexes
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_creators_status ON creators(status)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_videos_creator_id ON videos(creator_id)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_videos_status_created ON videos(status, created_at)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_cuts_creator_id ON cuts(creator_id)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_cuts_video_id ON cuts(video_id)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_cuts_status ON cuts(status)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_cuts_status_created ON cuts(status, created_at)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_operations_status ON operations(status)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at)`)
}
