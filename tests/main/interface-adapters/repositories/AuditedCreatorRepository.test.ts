import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  SqliteCreatorRepository,
  SqliteAuditLogRepository,
  AuditedCreatorRepository
} from '@main/interface-adapters/repositories'
import type { Creator } from '@domain/entities'
import type { DatabaseInstance } from '@main/framework-drivers/database'
import { createTestDb } from '../../helpers/createTestDb'

function makeCreator(overrides: Partial<Creator> = {}): Creator {
  return {
    id: 'creator-1',
    folderName: 'creator-1',
    name: 'Test Creator',
    profileImagePath: null,
    status: 'active',
    deletedAt: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides
  }
}

describe('AuditedCreatorRepository', () => {
  let database: DatabaseInstance
  let innerRepo: SqliteCreatorRepository
  let auditLogRepo: SqliteAuditLogRepository
  let repo: AuditedCreatorRepository

  beforeEach(() => {
    database = createTestDb()
    innerRepo = new SqliteCreatorRepository(database.db)
    auditLogRepo = new SqliteAuditLogRepository(database.db)
    repo = new AuditedCreatorRepository(innerRepo, auditLogRepo)
  })

  afterEach(() => {
    database.raw.close()
  })

  // ── Read delegation ──

  it('delegates findAll to inner repo', () => {
    repo.upsert(makeCreator())
    const all = repo.findAll()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe('creator-1')
  })

  it('delegates findById to inner repo', () => {
    repo.upsert(makeCreator())
    expect(repo.findById('creator-1')).not.toBeNull()
    expect(repo.findById('ghost')).toBeNull()
  })

  it('delegates findAllActive to inner repo', () => {
    repo.upsert(makeCreator({ id: 'c1', folderName: 'c1', status: 'active' }))
    repo.upsert(makeCreator({ id: 'c2', folderName: 'c2', status: 'missing' }))
    expect(repo.findAllActive()).toHaveLength(1)
  })

  it('delegates findByFolderName to inner repo', () => {
    repo.upsert(makeCreator())
    expect(repo.findByFolderName('creator-1')).not.toBeNull()
    expect(repo.findByFolderName('nope')).toBeNull()
  })

  it('delegates findPaginated to inner repo', () => {
    repo.upsert(makeCreator())
    const result = repo.findPaginated({ page: 1, pageSize: 10 })
    expect(result.total).toBe(1)
  })

  // ── upsert: create ──

  it('logs "created" action when inserting a new entity', () => {
    repo.upsert(makeCreator())

    const logs = auditLogRepo.findByEntity('creator', 'creator-1')
    expect(logs).toHaveLength(1)
    expect(logs[0].action).toBe('created')
    expect(logs[0].changes).toBeNull()
  })

  // ── upsert: update with changes ──

  it('logs "updated" action with diff when entity changes', () => {
    repo.upsert(makeCreator({ name: 'Original' }))
    repo.upsert(makeCreator({ name: 'Updated', updatedAt: '2025-02-01T00:00:00.000Z' }))

    const logs = auditLogRepo.findByEntity('creator', 'creator-1')
    expect(logs).toHaveLength(2)

    const updateLog = logs.find((l) => l.action === 'updated')
    expect(updateLog).toBeDefined()

    const changes = JSON.parse(updateLog!.changes!)
    expect(changes.name).toEqual({ old: 'Original', new: 'Updated' })
  })

  // ── upsert: no actual changes ──

  it('does NOT log "updated" when upsert has identical data', () => {
    const creator = makeCreator()
    repo.upsert(creator)
    repo.upsert(creator) // same data, same updatedAt

    const logs = auditLogRepo.findByEntity('creator', 'creator-1')
    // Only the initial "created" entry, no "updated"
    expect(logs).toHaveLength(1)
    expect(logs[0].action).toBe('created')
  })

  // ── updateStatus ──

  it('logs "status_changed" action with old/new status', () => {
    repo.upsert(makeCreator({ status: 'active' }))
    repo.updateStatus('creator-1', 'missing', null)

    const logs = auditLogRepo.findByEntity('creator', 'creator-1')
    const statusLog = logs.find((l) => l.action === 'status_changed')
    expect(statusLog).toBeDefined()

    const changes = JSON.parse(statusLog!.changes!)
    expect(changes.status).toEqual({ old: 'active', new: 'missing' })
    expect(changes.deletedAt).toEqual({ old: null, new: null })
  })

  it('logs deletedAt change when marking as deleted', () => {
    repo.upsert(makeCreator())
    repo.updateStatus('creator-1', 'deleted', '2025-06-01T00:00:00.000Z')

    const logs = auditLogRepo.findByEntity('creator', 'creator-1')
    const statusLog = logs.find((l) => l.action === 'status_changed')
    const changes = JSON.parse(statusLog!.changes!)
    expect(changes.status).toEqual({ old: 'active', new: 'deleted' })
    expect(changes.deletedAt).toEqual({ old: null, new: '2025-06-01T00:00:00.000Z' })
  })

  it('logs status_changed even when entity is not found (old values are null)', () => {
    // Edge: updateStatus on non-existent ID — inner repo does nothing but audit logs attempt
    repo.updateStatus('ghost', 'active', null)

    const logs = auditLogRepo.findByEntity('creator', 'ghost')
    expect(logs).toHaveLength(1)
    expect(logs[0].action).toBe('status_changed')
    const changes = JSON.parse(logs[0].changes!)
    expect(changes.status.old).toBeNull()
  })

  // ── delete ──

  it('logs "deleted" action', () => {
    repo.upsert(makeCreator())
    repo.delete('creator-1')

    const logs = auditLogRepo.findByEntity('creator', 'creator-1')
    const deleteLog = logs.find((l) => l.action === 'deleted')
    expect(deleteLog).toBeDefined()
    expect(deleteLog!.changes).toBeNull()
  })

  it('entity is removed after delete', () => {
    repo.upsert(makeCreator())
    repo.delete('creator-1')
    expect(repo.findById('creator-1')).toBeNull()
  })
})
