import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteAuditLogRepository } from '@main/interface-adapters/repositories'
import type { AuditEntry } from '@domain/entities'
import type { DatabaseInstance } from '@main/framework-drivers/database'
import { createTestDb } from '../../helpers/createTestDb'

function makeEntry(overrides: Partial<Omit<AuditEntry, 'id'>> = {}): Omit<AuditEntry, 'id'> {
  return {
    entityType: 'creator',
    entityId: 'c-1',
    action: 'created',
    changes: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides
  }
}

describe('SqliteAuditLogRepository', () => {
  let database: DatabaseInstance
  let repo: SqliteAuditLogRepository

  beforeEach(() => {
    database = createTestDb()
    repo = new SqliteAuditLogRepository(database.db)
  })

  afterEach(() => {
    database.raw.close()
  })

  // ── append + findByEntity ──

  it('appends an entry and retrieves it by entity', () => {
    repo.append(makeEntry())

    const entries = repo.findByEntity('creator', 'c-1')
    expect(entries).toHaveLength(1)
    expect(entries[0].entityType).toBe('creator')
    expect(entries[0].entityId).toBe('c-1')
    expect(entries[0].action).toBe('created')
    expect(entries[0].changes).toBeNull()
  })

  it('assigns auto-incremented ids', () => {
    repo.append(makeEntry({ entityId: 'c-1' }))
    repo.append(makeEntry({ entityId: 'c-2' }))

    const e1 = repo.findByEntity('creator', 'c-1')
    const e2 = repo.findByEntity('creator', 'c-2')

    expect(e1[0].id).toBeDefined()
    expect(e2[0].id).toBeDefined()
    expect(e2[0].id!).toBeGreaterThan(e1[0].id!)
  })

  it('stores changes JSON diff', () => {
    const changes = JSON.stringify({ name: { old: 'Alpha', new: 'Beta' } })
    repo.append(makeEntry({ action: 'updated', changes }))

    const entries = repo.findByEntity('creator', 'c-1')
    expect(entries[0].changes).toBe(changes)
    expect(JSON.parse(entries[0].changes!)).toEqual({ name: { old: 'Alpha', new: 'Beta' } })
  })

  // ── findByEntity ──

  it('returns empty array when no entries match', () => {
    repo.append(makeEntry({ entityType: 'creator', entityId: 'c-1' }))
    expect(repo.findByEntity('video', 'v-1')).toEqual([])
  })

  it('returns only entries for the exact entityType + entityId combination', () => {
    repo.append(makeEntry({ entityType: 'creator', entityId: 'c-1' }))
    repo.append(makeEntry({ entityType: 'creator', entityId: 'c-2' }))
    repo.append(makeEntry({ entityType: 'video', entityId: 'c-1' }))

    const results = repo.findByEntity('creator', 'c-1')
    expect(results).toHaveLength(1)
    expect(results[0].entityType).toBe('creator')
    expect(results[0].entityId).toBe('c-1')
  })

  it('orders results by createdAt DESC', () => {
    repo.append(makeEntry({ createdAt: '2025-01-01T00:00:00.000Z', action: 'created' }))
    repo.append(makeEntry({ createdAt: '2025-01-03T00:00:00.000Z', action: 'updated' }))
    repo.append(makeEntry({ createdAt: '2025-01-02T00:00:00.000Z', action: 'status_changed' }))

    const entries = repo.findByEntity('creator', 'c-1')
    expect(entries).toHaveLength(3)
    expect(entries[0].action).toBe('updated')
    expect(entries[1].action).toBe('status_changed')
    expect(entries[2].action).toBe('created')
  })

  // ── findRecent ──

  it('returns empty array when no entries exist', () => {
    expect(repo.findRecent(10)).toEqual([])
  })

  it('returns at most `limit` entries', () => {
    for (let i = 0; i < 10; i++) {
      repo.append(
        makeEntry({
          entityId: `c-${i}`,
          createdAt: `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`
        })
      )
    }

    const recent = repo.findRecent(5)
    expect(recent).toHaveLength(5)
  })

  it('orders by createdAt DESC (most recent first)', () => {
    repo.append(makeEntry({ entityId: 'c-old', createdAt: '2025-01-01T00:00:00.000Z' }))
    repo.append(makeEntry({ entityId: 'c-new', createdAt: '2025-06-01T00:00:00.000Z' }))

    const recent = repo.findRecent(10)
    expect(recent[0].entityId).toBe('c-new')
    expect(recent[1].entityId).toBe('c-old')
  })

  it('returns all entries when limit exceeds total count', () => {
    repo.append(makeEntry({ entityId: 'c-1' }))
    repo.append(makeEntry({ entityId: 'c-2' }))

    const recent = repo.findRecent(100)
    expect(recent).toHaveLength(2)
  })

  // ── Multiple entity types ──

  it('stores and retrieves entries for all entity types', () => {
    repo.append(makeEntry({ entityType: 'creator', entityId: 'c-1' }))
    repo.append(makeEntry({ entityType: 'video', entityId: 'v-1' }))
    repo.append(makeEntry({ entityType: 'cut', entityId: 'cut-1' }))

    expect(repo.findByEntity('creator', 'c-1')).toHaveLength(1)
    expect(repo.findByEntity('video', 'v-1')).toHaveLength(1)
    expect(repo.findByEntity('cut', 'cut-1')).toHaveLength(1)
    expect(repo.findRecent(10)).toHaveLength(3)
  })

  // ── All action types ──

  it('stores all audit action types correctly', () => {
    const actions = ['created', 'updated', 'status_changed', 'deleted'] as const
    for (const action of actions) {
      repo.append(makeEntry({ action, entityId: `e-${action}` }))
    }

    for (const action of actions) {
      const entries = repo.findByEntity('creator', `e-${action}`)
      expect(entries[0].action).toBe(action)
    }
  })
})

