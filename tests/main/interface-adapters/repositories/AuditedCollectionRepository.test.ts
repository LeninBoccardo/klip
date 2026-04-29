import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuditedCollectionRepository } from '@main/interface-adapters/repositories'
import type { ICollectionRepository, IAuditLogRepository } from '@domain/repositories'
import type { ITransactionScope } from '@domain/ports'
import type { Collection } from '@domain/entities'

function makeCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: 'col-1',
    name: 'Favourites',
    description: null,
    kind: 'manual',
    smartQuery: null,
    createdAt: '2025-02-01T00:00:00.000Z',
    updatedAt: '2025-02-01T00:00:00.000Z',
    ...overrides
  }
}

function makeMocks(): {
  inner: ICollectionRepository
  auditLog: IAuditLogRepository
  transaction: ITransactionScope
  audited: AuditedCollectionRepository
} {
  const inner: ICollectionRepository = {
    findAll: vi.fn().mockReturnValue([]),
    findById: vi.fn().mockReturnValue(null),
    findPaginated: vi.fn(),
    upsert: vi.fn(),
    upsertWithPrevious: vi.fn(),
    delete: vi.fn(),
    getItems: vi.fn().mockReturnValue([]),
    addVideo: vi.fn(),
    addCut: vi.fn(),
    removeVideo: vi.fn(),
    removeCut: vi.fn(),
    reorderItems: vi.fn()
  }
  const auditLog: IAuditLogRepository = {
    append: vi.fn(),
    findByEntity: vi.fn(),
    findRecent: vi.fn()
  } as unknown as IAuditLogRepository
  const transaction: ITransactionScope = { run: vi.fn(<T>(fn: () => T) => fn()) }
  return {
    inner,
    auditLog,
    transaction,
    audited: new AuditedCollectionRepository(inner, auditLog, transaction)
  }
}

describe('AuditedCollectionRepository', () => {
  let mocks: ReturnType<typeof makeMocks>

  beforeEach(() => {
    mocks = makeMocks()
  })

  it('upsert with no previous writes a "created" audit row', () => {
    mocks.audited.upsertWithPrevious(makeCollection({ id: 'a' }), null)

    expect(mocks.inner.upsert).toHaveBeenCalledTimes(1)
    expect(mocks.transaction.run).toHaveBeenCalledTimes(1)
    expect(mocks.auditLog.append).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'collection', entityId: 'a', action: 'created' })
    )
  })

  it('upsert with a different prior writes an "updated" diff', () => {
    const prev = makeCollection({ id: 'a', name: 'Old' })
    const next = makeCollection({ id: 'a', name: 'New' })

    mocks.audited.upsertWithPrevious(next, prev)

    expect(mocks.auditLog.append).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'collection', entityId: 'a', action: 'updated' })
    )
  })

  it('upsert with identical prior skips the audit row entirely', () => {
    const collection = makeCollection({ id: 'a' })
    mocks.audited.upsertWithPrevious(collection, collection)

    // upsert still runs (use case decides idempotency); the diff is null so
    // we shouldn't write a "no-op" audit entry.
    expect(mocks.inner.upsert).toHaveBeenCalledTimes(1)
    expect(mocks.auditLog.append).not.toHaveBeenCalled()
  })

  it('delete records a "deleted" entry', () => {
    mocks.audited.delete('a')

    expect(mocks.inner.delete).toHaveBeenCalledWith('a')
    expect(mocks.auditLog.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'deleted', entityId: 'a' })
    )
  })

  it('addVideo / addCut audit "item_added" with kind+id+position payload', () => {
    mocks.audited.addVideo('col', 'v-1', 5, '2025-02-01T00:00:00.000Z')
    expect(mocks.auditLog.append).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'item_added',
        entityId: 'col',
        changes: JSON.stringify({ kind: 'video', id: 'v-1', position: 5 })
      })
    )

    mocks.audited.addCut('col', 'cut-1', 6, '2025-02-01T00:00:00.000Z')
    expect(mocks.auditLog.append).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'item_added',
        changes: JSON.stringify({ kind: 'cut', id: 'cut-1', position: 6 })
      })
    )
  })

  it('removeVideo / removeCut audit "item_removed" with kind+id payload', () => {
    mocks.audited.removeVideo('col', 'v-1')
    expect(mocks.auditLog.append).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'item_removed',
        changes: JSON.stringify({ kind: 'video', id: 'v-1' })
      })
    )

    mocks.audited.removeCut('col', 'cut-1')
    expect(mocks.auditLog.append).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'item_removed',
        changes: JSON.stringify({ kind: 'cut', id: 'cut-1' })
      })
    )
  })

  it('reorderItems audits "reordered" with item count and order list', () => {
    mocks.audited.reorderItems('col', [
      { kind: 'video', id: 'v-2', position: 0, addedAt: '' },
      { kind: 'cut', id: 'cut-1', position: 1, addedAt: '' }
    ])

    expect(mocks.inner.reorderItems).toHaveBeenCalledTimes(1)
    expect(mocks.auditLog.append).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reordered',
        entityId: 'col',
        changes: JSON.stringify({ itemCount: 2, order: ['video:v-2', 'cut:cut-1'] })
      })
    )
  })

  it('every mutation runs inside a single transaction (atomicity invariant)', () => {
    mocks.audited.delete('a')
    mocks.audited.addVideo('col', 'v-1', 0, 'now')
    mocks.audited.removeCut('col', 'cut-1')
    mocks.audited.reorderItems('col', [])

    expect(mocks.transaction.run).toHaveBeenCalledTimes(4)
  })

  it('reads delegate without invoking the audit log', () => {
    mocks.audited.findAll()
    mocks.audited.findById('a')
    mocks.audited.getItems('col')

    expect(mocks.inner.findAll).toHaveBeenCalled()
    expect(mocks.inner.findById).toHaveBeenCalledWith('a')
    expect(mocks.inner.getItems).toHaveBeenCalledWith('col')
    expect(mocks.auditLog.append).not.toHaveBeenCalled()
    expect(mocks.transaction.run).not.toHaveBeenCalled()
  })
})
