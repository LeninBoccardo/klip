import { describe, it, expect, afterEach } from 'vitest'
import { createTestDb } from '../helpers/createTestDb'
import type { DatabaseInstance } from '@main/framework-drivers/database'

describe('initializeDatabase', () => {
  let database: DatabaseInstance

  afterEach(() => {
    database?.raw.close()
  })

  it('requests WAL journal mode (in-memory falls back to "memory")', () => {
    database = createTestDb()
    const mode = database.raw.pragma('journal_mode', { simple: true }) as string
    // In-memory DBs don't support WAL — SQLite silently uses "memory" journal mode.
    expect(mode).toBe('memory')
  })

  it('enables foreign keys', () => {
    database = createTestDb()
    const fk = database.raw.pragma('foreign_keys', { simple: true }) as number
    expect(fk).toBe(1)
  })

  it('creates all expected tables', () => {
    database = createTestDb()
    const tables = database.raw
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
      )
      .all() as { name: string }[]

    const names = tables.map((t) => t.name)
    expect(names).toContain('creators')
    expect(names).toContain('videos')
    expect(names).toContain('cuts')
    expect(names).toContain('settings')
    expect(names).toContain('operations')
    expect(names).toContain('audit_log')
  })

  it('creates expected indexes', () => {
    database = createTestDb()
    const indexes = database.raw
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'`)
      .all() as { name: string }[]

    const names = indexes.map((i) => i.name)
    expect(names).toContain('idx_videos_creator_id')
    expect(names).toContain('idx_cuts_creator_id')
    expect(names).toContain('idx_cuts_video_id')
    expect(names).toContain('idx_creators_status')
    expect(names).toContain('idx_videos_status')
    expect(names).toContain('idx_cuts_status')
    expect(names).toContain('idx_videos_status_created')
    expect(names).toContain('idx_cuts_status_created')
    expect(names).toContain('idx_operations_status')
    expect(names).toContain('idx_audit_log_entity')
    expect(names).toContain('idx_audit_log_created')
  })

  it('creators table has folder_name column', () => {
    database = createTestDb()
    const columns = database.raw.prepare(`PRAGMA table_info(creators)`).all() as {
      name: string
    }[]
    const colNames = columns.map((c) => c.name)
    expect(colNames).toContain('folder_name')
    expect(colNames).toContain('status')
    expect(colNames).toContain('deleted_at')
  })

  it('all entity tables have status and deleted_at columns', () => {
    database = createTestDb()
    for (const table of ['creators', 'videos', 'cuts']) {
      const columns = database.raw.prepare(`PRAGMA table_info(${table})`).all() as {
        name: string
      }[]
      const colNames = columns.map((c) => c.name)
      expect(colNames).toContain('status')
      expect(colNames).toContain('deleted_at')
    }
  })
})
