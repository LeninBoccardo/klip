import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteCreatorRepository } from '@main/interface-adapters/repositories'
import type { Creator } from '@domain/entities'
import { createTestDb } from '../../helpers/createTestDb'

function makeCreator(overrides: Partial<Creator> = {}): Creator {
  return {
    id: 'creator-1',
    name: 'Test Creator',
    profileImagePath: null,
    status: 'active',
    deletedAt: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides
  }
}

describe('SqliteCreatorRepository', () => {
  let db: ReturnType<typeof createTestDb>
  let repo: SqliteCreatorRepository

  beforeEach(() => {
    db = createTestDb()
    repo = new SqliteCreatorRepository(db)
  })

  afterEach(() => {
    db.close()
  })

  // ── findAll ──

  it('returns an empty array when no creators exist', () => {
    expect(repo.findAll()).toEqual([])
  })

  it('returns all creators ordered by name ASC', () => {
    repo.upsert(makeCreator({ id: 'c-2', name: 'Bravo' }))
    repo.upsert(makeCreator({ id: 'c-1', name: 'Alpha' }))
    repo.upsert(makeCreator({ id: 'c-3', name: 'Charlie' }))

    const names = repo.findAll().map((c) => c.name)
    expect(names).toEqual(['Alpha', 'Bravo', 'Charlie'])
  })

  // ── findById ──

  it('returns null for a non-existent id', () => {
    expect(repo.findById('does-not-exist')).toBeNull()
  })

  it('returns the creator for a valid id', () => {
    const creator = makeCreator()
    repo.upsert(creator)
    expect(repo.findById('creator-1')).toEqual(creator)
  })

  // ── upsert ──

  it('inserts a new creator', () => {
    repo.upsert(makeCreator())
    expect(repo.findAll()).toHaveLength(1)
  })

  it('updates an existing creator on conflict', () => {
    repo.upsert(makeCreator({ name: 'Original' }))
    repo.upsert(makeCreator({ name: 'Updated' }))

    const result = repo.findById('creator-1')
    expect(result?.name).toBe('Updated')
    expect(repo.findAll()).toHaveLength(1)
  })

  // ── delete ──

  it('deletes a creator by id', () => {
    repo.upsert(makeCreator())
    repo.delete('creator-1')
    expect(repo.findById('creator-1')).toBeNull()
  })

  it('is a no-op when deleting a non-existent id', () => {
    expect(() => repo.delete('ghost')).not.toThrow()
  })

  // ── findPaginated ──

  describe('findPaginated', () => {
    beforeEach(() => {
      for (let i = 1; i <= 25; i++) {
        repo.upsert(
          makeCreator({
            id: `c-${String(i).padStart(2, '0')}`,
            name: `Creator ${String(i).padStart(2, '0')}`
          })
        )
      }
    })

    it('returns the first page with correct metadata', () => {
      const result = repo.findPaginated({ page: 1, pageSize: 10 })
      expect(result.data).toHaveLength(10)
      expect(result.total).toBe(25)
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(10)
      expect(result.totalPages).toBe(3)
    })

    it('returns the last (partial) page', () => {
      const result = repo.findPaginated({ page: 3, pageSize: 10 })
      expect(result.data).toHaveLength(5)
    })

    it('filters by search term', () => {
      const result = repo.findPaginated({ page: 1, pageSize: 50, search: 'Creator 01' })
      expect(result.total).toBe(1)
      expect(result.data[0].name).toBe('Creator 01')
    })

    it('sorts by name descending', () => {
      const result = repo.findPaginated({
        page: 1,
        pageSize: 3,
        sortBy: 'name',
        sortDirection: 'desc'
      })
      expect(result.data[0].name).toBe('Creator 25')
    })

    it('falls back to default sort column for unknown sortBy', () => {
      const result = repo.findPaginated({
        page: 1,
        pageSize: 3,
        sortBy: 'INVALID; DROP TABLE creators;--'
      })
      // Default sort is 'name' ASC — should not throw and should return valid data
      expect(result.data).toHaveLength(3)
      expect(result.data[0].name).toBe('Creator 01')
    })

    it('returns empty data for a page beyond the total', () => {
      const result = repo.findPaginated({ page: 100, pageSize: 10 })
      expect(result.data).toHaveLength(0)
      expect(result.total).toBe(25)
    })

    it('defaults to status=active filter', () => {
      repo.updateStatus('c-01', 'missing', null)
      repo.updateStatus('c-02', 'deleted', '2025-06-01T00:00:00.000Z')

      const result = repo.findPaginated({ page: 1, pageSize: 50 })
      expect(result.total).toBe(23)
    })

    it('filters by explicit status array', () => {
      repo.updateStatus('c-01', 'missing', null)

      const result = repo.findPaginated({ page: 1, pageSize: 50, status: ['missing'] })
      expect(result.total).toBe(1)
      expect(result.data[0].status).toBe('missing')
    })
  })

  // ── updateStatus ──

  it('sets status and deletedAt', () => {
    repo.upsert(makeCreator())
    repo.updateStatus('creator-1', 'deleted', '2025-06-01T00:00:00.000Z')

    const result = repo.findById('creator-1')
    expect(result?.status).toBe('deleted')
    expect(result?.deletedAt).toBe('2025-06-01T00:00:00.000Z')
  })

  // ── findAllActive ──

  it('returns only active creators', () => {
    repo.upsert(makeCreator({ id: 'c-1', name: 'Active' }))
    repo.upsert(makeCreator({ id: 'c-2', name: 'Missing', status: 'missing' }))
    repo.upsert(
      makeCreator({ id: 'c-3', name: 'Deleted', status: 'deleted', deletedAt: '2025-06-01' })
    )

    const active = repo.findAllActive()
    expect(active).toHaveLength(1)
    expect(active[0].name).toBe('Active')
  })
})




