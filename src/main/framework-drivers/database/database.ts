import BetterSqlite3 from 'better-sqlite3'

const CURRENT_SCHEMA_VERSION = 2

/**
 * Run all migrations sequentially from the current version to CURRENT_SCHEMA_VERSION.
 * Each case falls through intentionally to apply every subsequent migration.
 */
function migrate(db: BetterSqlite3.Database, fromVersion: number): void {
  switch (fromVersion) {
    case 0:
      db.exec(`
        CREATE TABLE IF NOT EXISTS creators (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          profile_image_path TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS videos (
          id TEXT PRIMARY KEY,
          creator_id TEXT NOT NULL,
          title TEXT NOT NULL,
          url TEXT,
          duration INTEGER,
          resolution TEXT,
          file_size INTEGER,
          file_path TEXT NOT NULL,
          thumbnail_path TEXT,
          download_date TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS cuts (
          id TEXT PRIMARY KEY,
          creator_id TEXT NOT NULL,
          video_id TEXT,
          title TEXT NOT NULL,
          tags TEXT NOT NULL DEFAULT '[]',
          start_timestamp REAL,
          end_timestamp REAL,
          duration INTEGER,
          resolution TEXT,
          file_size INTEGER,
          file_path TEXT NOT NULL,
          thumbnail_path TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE,
          FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_videos_creator_id ON videos(creator_id);
        CREATE INDEX IF NOT EXISTS idx_cuts_creator_id ON cuts(creator_id);
        CREATE INDEX IF NOT EXISTS idx_cuts_video_id ON cuts(video_id);
      `)
    // falls through — future case 1, case 2, etc. go here
    case 1:
      db.exec(`
        ALTER TABLE creators ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
        ALTER TABLE creators ADD COLUMN deleted_at TEXT;

        ALTER TABLE videos ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
        ALTER TABLE videos ADD COLUMN deleted_at TEXT;

        ALTER TABLE cuts ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
        ALTER TABLE cuts ADD COLUMN deleted_at TEXT;
      `)
    // falls through
  }

  db.pragma(`user_version = ${CURRENT_SCHEMA_VERSION}`)
}

/**
 * Open (or create) the SQLite database at `dbPath`, enable WAL mode and
 * foreign keys, and run any pending schema migrations.
 */
export function initializeDatabase(dbPath: string): BetterSqlite3.Database {
  const db = new BetterSqlite3(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  const currentVersion = db.pragma('user_version', { simple: true }) as number

  // Wrap the entire migration sequence in a single transaction
  if (currentVersion < CURRENT_SCHEMA_VERSION) {
    db.transaction(() => {
      migrate(db, currentVersion)
    })()
  }

  return db
}
