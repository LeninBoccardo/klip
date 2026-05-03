import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteOperationRepository } from '@main/interface-adapters/repositories'
import type { Operation } from '@domain/entities'
import type { DatabaseInstance } from '@main/framework-drivers/database'
import { createTestDb } from '../../helpers/createTestDb'

function makeOperation(overrides: Partial<Operation> = {}): Operation {
  return {
    id: 'op-1',
    type: 'rename_folder',
    status: 'pending',
    payload: JSON.stringify({ oldName: 'foo', newName: 'bar' }),
    error: null,
    startedAt: null,
    completedAt: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides
  }
}

describe('SqliteOperationRepository', () => {
  let database: DatabaseInstance
  let repo: SqliteOperationRepository

  beforeEach(() => {
    database = createTestDb()
    repo = new SqliteOperationRepository(database.db)
  })

  afterEach(() => {
    database.raw.close()
  })

  // ── create + findById ──

  it('creates an operation and retrieves it by id', () => {
    const op = makeOperation()
    repo.create(op)

    const found = repo.findById('op-1')
    expect(found).toEqual(op)
  })

  it('returns null for a non-existent id', () => {
    expect(repo.findById('ghost')).toBeNull()
  })

  it('creates multiple operations with different ids', () => {
    repo.create(makeOperation({ id: 'op-1' }))
    repo.create(makeOperation({ id: 'op-2', type: 'migrate_root' }))

    expect(repo.findById('op-1')).not.toBeNull()
    expect(repo.findById('op-2')).not.toBeNull()
    expect(repo.findById('op-2')?.type).toBe('migrate_root')
  })

  // ── findByStatus ──

  it('returns empty array when no operations match the status', () => {
    repo.create(makeOperation({ status: 'pending' }))
    expect(repo.findByStatus('completed')).toEqual([])
  })

  it('returns all operations matching the given status', () => {
    repo.create(makeOperation({ id: 'op-1', status: 'pending' }))
    repo.create(makeOperation({ id: 'op-2', status: 'in_progress' }))
    repo.create(makeOperation({ id: 'op-3', status: 'pending' }))

    const pending = repo.findByStatus('pending')
    expect(pending).toHaveLength(2)
    const ids = pending.map((o) => o.id).sort()
    expect(ids).toEqual(['op-1', 'op-3'])
  })

  it('returns operations with every status type', () => {
    const statuses = ['pending', 'in_progress', 'completed', 'failed', 'rolled_back'] as const
    for (const [i, status] of statuses.entries()) {
      repo.create(makeOperation({ id: `op-${i}`, status }))
    }

    for (const [i, status] of statuses.entries()) {
      const results = repo.findByStatus(status)
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe(`op-${i}`)
    }
  })

  // ── updateStatus ──

  it('transitions pending → in_progress and sets startedAt', () => {
    repo.create(makeOperation({ id: 'op-1', status: 'pending' }))
    repo.updateStatus('op-1', 'in_progress')

    const updated = repo.findById('op-1')
    expect(updated?.status).toBe('in_progress')
    expect(updated?.startedAt).not.toBeNull()
    expect(updated?.completedAt).toBeNull()
  })

  it('transitions in_progress → completed and sets completedAt', () => {
    repo.create(makeOperation({ id: 'op-1', status: 'in_progress' }))
    repo.updateStatus('op-1', 'completed')

    const updated = repo.findById('op-1')
    expect(updated?.status).toBe('completed')
    expect(updated?.completedAt).not.toBeNull()
  })

  it('transitions in_progress → failed with error message', () => {
    repo.create(makeOperation({ id: 'op-1', status: 'in_progress' }))
    repo.updateStatus('op-1', 'failed', 'Disk full')

    const updated = repo.findById('op-1')
    expect(updated?.status).toBe('failed')
    expect(updated?.error).toBe('Disk full')
    expect(updated?.completedAt).not.toBeNull()
  })

  it('transitions to rolled_back and sets completedAt', () => {
    repo.create(makeOperation({ id: 'op-1', status: 'in_progress' }))
    repo.updateStatus('op-1', 'rolled_back')

    const updated = repo.findById('op-1')
    expect(updated?.status).toBe('rolled_back')
    expect(updated?.completedAt).not.toBeNull()
  })

  it('does NOT set completedAt for non-terminal status (pending)', () => {
    repo.create(
      makeOperation({
        id: 'op-1',
        status: 'in_progress',
        startedAt: '2025-01-01T00:00:00.000Z'
      })
    )
    repo.updateStatus('op-1', 'pending')

    const updated = repo.findById('op-1')
    expect(updated?.status).toBe('pending')
    expect(updated?.completedAt).toBeNull()
  })

  it('clears error to null when not provided', () => {
    repo.create(makeOperation({ id: 'op-1', status: 'failed', error: 'Old error' }))
    repo.updateStatus('op-1', 'in_progress')

    const updated = repo.findById('op-1')
    expect(updated?.error).toBeNull()
  })

  // ── updatePayload ──

  it('updates the payload JSON', () => {
    repo.create(makeOperation({ id: 'op-1', payload: '{"step":1}' }))
    repo.updatePayload('op-1', '{"step":2,"movedSoFar":5}')

    const updated = repo.findById('op-1')
    expect(JSON.parse(updated!.payload)).toEqual({ step: 2, movedSoFar: 5 })
  })

  it('updatePayload does not affect other fields', () => {
    const original = makeOperation({ id: 'op-1', status: 'in_progress' })
    repo.create(original)
    repo.updatePayload('op-1', '{"progress":50}')

    const updated = repo.findById('op-1')
    expect(updated?.status).toBe('in_progress')
    expect(updated?.type).toBe('rename_folder')
    expect(updated?.error).toBeNull()
  })

  it('roundtrips a v2 MigrateRoot payload (partial rollback, per-folder status)', () => {
    // Crash-recovery hinges on SqliteOperationRepository preserving the v2
    // schema verbatim. The use-case test asserts what we hand to updatePayload;
    // this asserts what comes back after a real persist+read so a future
    // serialization regression (e.g. losing a key, lossy stringification of
    // booleans) doesn't slip past in JSON.stringify-only mocks.
    const v2Payload = {
      version: 2,
      oldRoot: '/old/root',
      newRoot: '/new/root',
      folders: ['creator-a', 'creator-b'],
      moves: [
        { folder: 'creator-a', status: 'moved' as const },
        { folder: 'creator-b', status: 'rolled-back' as const }
      ],
      partial: true
    }
    repo.create(makeOperation({ id: 'op-mig-1', type: 'migrate_root' }))
    repo.updatePayload('op-mig-1', JSON.stringify(v2Payload))

    const reloaded = repo.findById('op-mig-1')
    expect(JSON.parse(reloaded!.payload)).toEqual(v2Payload)
  })

  it('preserves moves[] order across persist+read (insertion order matters for recovery)', () => {
    // Recovery walks `moves` in order; a hash-mapped JSON column would
    // shuffle it. better-sqlite3 stores the raw string so order is stable —
    // pin that contract.
    const ordered = {
      version: 2,
      oldRoot: '/o',
      newRoot: '/n',
      folders: ['x', 'y', 'z'],
      moves: [
        { folder: 'z', status: 'moved' as const },
        { folder: 'a', status: 'moved' as const },
        { folder: 'm', status: 'rolled-back' as const }
      ]
    }
    repo.create(makeOperation({ id: 'op-ord', type: 'migrate_root' }))
    repo.updatePayload('op-ord', JSON.stringify(ordered))

    const reloaded = repo.findById('op-ord')
    const parsed = JSON.parse(reloaded!.payload)
    expect(parsed.moves.map((m: { folder: string }) => m.folder)).toEqual(['z', 'a', 'm'])
  })

  // ── Edge cases ──

  it('creates operation with all types', () => {
    const types = ['rename_folder', 'migrate_root', 'bulk_import'] as const
    for (const [i, type] of types.entries()) {
      repo.create(makeOperation({ id: `op-${i}`, type }))
    }

    expect(repo.findById('op-0')?.type).toBe('rename_folder')
    expect(repo.findById('op-1')?.type).toBe('migrate_root')
    expect(repo.findById('op-2')?.type).toBe('bulk_import')
  })

  it('preserves startedAt and completedAt from initial creation', () => {
    repo.create(
      makeOperation({
        id: 'op-1',
        startedAt: '2025-01-01T10:00:00.000Z',
        completedAt: '2025-01-01T10:05:00.000Z',
        status: 'completed'
      })
    )

    const found = repo.findById('op-1')
    expect(found?.startedAt).toBe('2025-01-01T10:00:00.000Z')
    expect(found?.completedAt).toBe('2025-01-01T10:05:00.000Z')
  })
})
