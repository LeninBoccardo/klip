import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { mkdtempSync, rmSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import BetterSqlite3 from 'better-sqlite3'
import { initializeDatabase } from '@main/framework-drivers/database'
import { applyMigrationFile, applyMigrationsUpTo, MIGRATIONS_DIR } from './helpers/migrate-step'

/**
 * Migration roundtrip tests — exercise the file-based `migrate()` path
 * that production uses (`:memory:` tests use `pushSchema` and never
 * touch the migration files, so this is the only place a typo in a
 * `.sql` file is caught before shipping).
 *
 * Each test runs against a brand-new on-disk DB in `os.tmpdir()` and
 * cleans up in `afterEach`. WAL files share the parent directory so
 * removing the dir tree handles them too.
 */

const ALL_MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()

let tmpDir: string
let dbPath: string

function rawOpen(): BetterSqlite3.Database {
  const raw = new BetterSqlite3(dbPath)
  raw.pragma('journal_mode = WAL')
  raw.pragma('foreign_keys = ON')
  return raw
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'klip-migrations-'))
  dbPath = join(tmpDir, 'klip-mig.db')
})

afterEach(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    // Windows: WAL handles can hold the file briefly. Best-effort.
  }
})

describe('Migrations — fresh apply', () => {
  it('applies every migration without error and yields the expected tables', () => {
    const { raw } = initializeDatabase(dbPath)

    const tables = raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: { name: string }) => r.name)

    // Drop SQLite-internal tables (sqlite_*) and FTS5 shadow tables
    // (videos_fts_data, _idx, _content, _docsize, _config); the
    // contract is that the public schema includes these named tables.
    const publicTables = tables.filter((t) => !t.startsWith('sqlite_') && !t.includes('_fts_'))

    // The `videos_fts` virtual table appears in sqlite_master as a
    // table-named entry — keep it as part of the contract.
    expect(publicTables).toEqual(
      [
        '__drizzle_migrations',
        'audit_log',
        'collection_cuts',
        'collection_videos',
        'collections',
        'creators',
        'cuts',
        'download_history',
        'operations',
        'settings',
        'videos',
        'videos_fts'
      ].sort()
    )

    raw.close()
  })

  it('creates the videos_fts virtual table with the unicode61 tokenizer', () => {
    const { raw } = initializeDatabase(dbPath)

    const ddl = raw.prepare("SELECT sql FROM sqlite_master WHERE name = 'videos_fts'").get() as
      | { sql: string }
      | undefined

    expect(ddl?.sql).toMatch(/USING fts5/i)
    expect(ddl?.sql).toMatch(/unicode61 remove_diacritics 2/i)

    raw.close()
  })

  it('creates all three videos_fts triggers', () => {
    const { raw } = initializeDatabase(dbPath)

    const triggers = raw
      .prepare("SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name")
      .all()
      .map((r: { name: string }) => r.name)

    expect(triggers).toEqual([
      'videos_fts_after_delete',
      'videos_fts_after_insert',
      'videos_fts_after_update'
    ])

    raw.close()
  })
})

describe('Migrations — 0009 backfill semantics', () => {
  /**
   * Seeds the schema as it existed at migration 0008 (no transcript_text
   * column, no FTS5 table), inserts sample videos with arbitrary
   * transcript content, applies 0009, and verifies the FTS5 table is
   * back-filled and triggers cover the live row lifecycle.
   */
  it('back-fills videos_fts from existing rows when migrated', () => {
    const raw = rawOpen()
    applyMigrationsUpTo(raw, '0008_shallow_wild_child.sql', ALL_MIGRATIONS)

    // Seed creators (FK target) + videos. Note: pre-0009 the videos
    // table has no transcript_text column.
    raw.exec(`
      INSERT INTO creators (id, folder_name, name, tags) VALUES
        ('c-1', 'creator-one', 'Creator One', '[]');
      INSERT INTO videos (id, creator_id, title, file_path, tags) VALUES
        ('v-1', 'c-1', 'First Video', '/tmp/v1.mkv', '[]'),
        ('v-2', 'c-1', 'Second Video', '/tmp/v2.mkv', '[]'),
        ('v-3', 'c-1', 'Third Video', '/tmp/v3.mkv', '[]');
    `)

    // Now apply 0009 — should add the column, create the FTS5 table,
    // create triggers, and back-fill the existing 3 rows.
    applyMigrationFile(raw, '0009_swift_silent_search.sql')

    const ftsCount = raw.prepare('SELECT count(*) as c FROM videos_fts').get() as { c: number }
    expect(ftsCount.c).toBe(3)

    // Spot-check that the title is searchable.
    const matches = raw
      .prepare("SELECT video_id FROM videos_fts WHERE videos_fts MATCH 'second'")
      .all() as Array<{ video_id: string }>
    expect(matches.map((r) => r.video_id)).toEqual(['v-2'])

    raw.close()
  })

  it('insert / update / delete triggers keep videos_fts in sync', () => {
    const raw = rawOpen()
    applyMigrationsUpTo(raw, '0009_swift_silent_search.sql', ALL_MIGRATIONS)

    raw.exec(`
      INSERT INTO creators (id, folder_name, name, tags) VALUES
        ('c-1', 'creator-one', 'Creator One', '[]');
    `)

    // Insert via the live table — trigger should mirror into videos_fts.
    raw
      .prepare(
        `INSERT INTO videos (id, creator_id, title, file_path, tags, transcript_text)
         VALUES (?, ?, ?, ?, '[]', ?)`
      )
      .run('v-1', 'c-1', 'Hello World', '/tmp/v1.mkv', 'lorem ipsum dolor')

    let count = (raw.prepare('SELECT count(*) as c FROM videos_fts').get() as { c: number }).c
    expect(count).toBe(1)

    let hits = raw
      .prepare("SELECT video_id FROM videos_fts WHERE videos_fts MATCH 'hello'")
      .all() as Array<{ video_id: string }>
    expect(hits.map((h) => h.video_id)).toEqual(['v-1'])

    // Update the title — trigger fires on `OF title` so this should
    // re-insert the FTS row with the new title.
    raw.prepare("UPDATE videos SET title = ? WHERE id = 'v-1'").run('Goodbye Universe')

    hits = raw
      .prepare("SELECT video_id FROM videos_fts WHERE videos_fts MATCH 'goodbye'")
      .all() as Array<{ video_id: string }>
    expect(hits.map((h) => h.video_id)).toEqual(['v-1'])

    hits = raw
      .prepare("SELECT video_id FROM videos_fts WHERE videos_fts MATCH 'hello'")
      .all() as Array<{ video_id: string }>
    expect(hits).toEqual([])

    // Delete — FTS row should disappear too.
    raw.prepare("DELETE FROM videos WHERE id = 'v-1'").run()

    count = (raw.prepare('SELECT count(*) as c FROM videos_fts').get() as { c: number }).c
    expect(count).toBe(0)

    raw.close()
  })
})

describe('Migrations — idempotency', () => {
  it('running migrate() a second time is a no-op', () => {
    // First initialisation runs every migration.
    const first = initializeDatabase(dbPath)
    const tables1 = first.raw
      .prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table'")
      .get() as { c: number }
    first.raw.close()

    // Re-open the same file and run again. drizzle's __drizzle_migrations
    // bookkeeping table should make this a no-op (no new tables, no
    // duplicate triggers).
    const second = initializeDatabase(dbPath)
    const tables2 = second.raw
      .prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table'")
      .get() as { c: number }

    expect(tables2.c).toBe(tables1.c)

    // Triggers should also be unchanged.
    const triggers = (
      second.raw.prepare("SELECT count(*) as c FROM sqlite_master WHERE type='trigger'").get() as {
        c: number
      }
    ).c
    expect(triggers).toBe(3)

    second.raw.close()
  })
})
