import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteTransactionScope } from '@main/framework-drivers/database/SqliteTransactionScope'
import { createTestDb } from '../helpers/createTestDb'

describe('SqliteTransactionScope', () => {
  let db: ReturnType<typeof createTestDb>
  let scope: SqliteTransactionScope

  beforeEach(() => {
    db = createTestDb()
    scope = new SqliteTransactionScope(db)
  })

  afterEach(() => {
    db.close()
  })

  it('commits on successful execution', () => {
    scope.run(() => {
      db.prepare(
        `INSERT INTO creators (id, name, status, created_at, updated_at) VALUES ('c1', 'Test', 'active', datetime('now'), datetime('now'))`
      ).run()
    })

    const row = db.prepare('SELECT id FROM creators WHERE id = ?').get('c1') as
      | { id: string }
      | undefined
    expect(row?.id).toBe('c1')
  })

  it('rolls back on error', () => {
    expect(() => {
      scope.run(() => {
        db.prepare(
          `INSERT INTO creators (id, name, status, created_at, updated_at) VALUES ('c2', 'Test', 'active', datetime('now'), datetime('now'))`
        ).run()
        throw new Error('Simulated failure')
      })
    }).toThrow('Simulated failure')

    const row = db.prepare('SELECT id FROM creators WHERE id = ?').get('c2')
    expect(row).toBeUndefined()
  })

  it('returns the value from the function', () => {
    const result = scope.run(() => 42)
    expect(result).toBe(42)
  })

  it('supports nested reads inside the transaction', () => {
    const result = scope.run(() => {
      db.prepare(
        `INSERT INTO creators (id, name, status, created_at, updated_at) VALUES ('c3', 'Nested', 'active', datetime('now'), datetime('now'))`
      ).run()
      const row = db.prepare('SELECT name FROM creators WHERE id = ?').get('c3') as { name: string }
      return row.name
    })
    expect(result).toBe('Nested')
  })
})
