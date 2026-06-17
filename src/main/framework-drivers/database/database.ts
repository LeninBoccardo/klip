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
      youtube_channel_id TEXT,
      youtube_channel_url TEXT,
      subscriber_count INTEGER,
      avatar_url TEXT,
      notes TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
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
      view_count INTEGER,
      like_count INTEGER,
      dislike_count INTEGER,
      comment_count INTEGER,
      category TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      upload_date TEXT,
      description TEXT,
      is_short INTEGER NOT NULL DEFAULT 0,
      transcript_path TEXT,
      transcript_text TEXT,
      detail_fetched_at TEXT,
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
      edit_recipe_json TEXT,
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

  db.run(sql`
    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      kind TEXT NOT NULL DEFAULT 'manual',
      smart_query TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.run(sql`
    CREATE TABLE IF NOT EXISTS collection_videos (
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (collection_id, video_id)
    )
  `)

  db.run(sql`
    CREATE TABLE IF NOT EXISTS collection_cuts (
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      cut_id TEXT NOT NULL REFERENCES cuts(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (collection_id, cut_id)
    )
  `)

  // ── Download history (mirrored in 0011_slimy_blue_shield.sql) ──
  db.run(sql`
    CREATE TABLE IF NOT EXISTS download_history (
      id TEXT PRIMARY KEY NOT NULL,
      youtube_url TEXT NOT NULL,
      video_id TEXT,
      video_title TEXT,
      thumbnail_url TEXT,
      creator_folder_name TEXT,
      status TEXT NOT NULL,
      error_message TEXT,
      error_retryable INTEGER DEFAULT true NOT NULL,
      finished_at TEXT DEFAULT (datetime('now')) NOT NULL
    )
  `)

  // Indexes
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_creators_status ON creators(status)`)
  // Partial UNIQUE index (matches migration 0007) — enforces one creator per
  // youtube_channel_id while allowing many NULLs. pushSchema previously kept the
  // pre-0007 plain index, so :memory: tests didn't enforce this uniqueness. (F41)
  db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_creators_yt_channel_id_unique ON creators(youtube_channel_id) WHERE youtube_channel_id IS NOT NULL`
  )
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_videos_creator_id ON videos(creator_id)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_videos_status_created ON videos(status, created_at)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_videos_detail_fetched ON videos(detail_fetched_at)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_videos_probe_status ON videos(probe_status)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_cuts_creator_id ON cuts(creator_id)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_cuts_video_id ON cuts(video_id)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_cuts_status ON cuts(status)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_cuts_status_created ON cuts(status, created_at)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_cuts_probe_status ON cuts(probe_status)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_operations_status ON operations(status)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_collections_updated_at ON collections(updated_at)`)
  db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_collection_videos_position ON collection_videos(collection_id, position)`
  )
  db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_collection_cuts_position ON collection_cuts(collection_id, position)`
  )
  // FK reverse-lookup indexes (mirrored from migration 0008) — back the
  // "which collections contain X?" lookup and the FK CASCADE on video/cut
  // delete. Present in production; were missing from the :memory: test schema. (F41)
  db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_collection_videos_video_id ON collection_videos(video_id)`
  )
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_collection_cuts_cut_id ON collection_cuts(cut_id)`)
  db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_download_history_finished_at ON download_history(finished_at)`
  )

  // ── Transcript FTS5 (mirrored in 0009_swift_silent_search.sql) ──
  db.run(sql`
    CREATE VIRTUAL TABLE IF NOT EXISTS videos_fts USING fts5(
      video_id UNINDEXED,
      title,
      transcript_text,
      tokenize = 'unicode61 remove_diacritics 2'
    )
  `)
  db.run(sql`
    CREATE TRIGGER IF NOT EXISTS videos_fts_after_insert AFTER INSERT ON videos BEGIN
      INSERT INTO videos_fts (video_id, title, transcript_text)
      VALUES (NEW.id, NEW.title, COALESCE(NEW.transcript_text, ''));
    END
  `)
  db.run(sql`
    CREATE TRIGGER IF NOT EXISTS videos_fts_after_update AFTER UPDATE OF title, transcript_text ON videos BEGIN
      DELETE FROM videos_fts WHERE video_id = OLD.id;
      INSERT INTO videos_fts (video_id, title, transcript_text)
      VALUES (NEW.id, NEW.title, COALESCE(NEW.transcript_text, ''));
    END
  `)
  db.run(sql`
    CREATE TRIGGER IF NOT EXISTS videos_fts_after_delete AFTER DELETE ON videos BEGIN
      DELETE FROM videos_fts WHERE video_id = OLD.id;
    END
  `)
}
