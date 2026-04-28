import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteCreatorRepository } from '@main/interface-adapters/repositories'
import type { Creator } from '@domain/entities'
import type { DatabaseInstance } from '@main/framework-drivers/database'
import { createTestDb } from '../../helpers/createTestDb'

function makeCreator(overrides: Partial<Creator> = {}): Creator {
  return {
    id: 'creator-1',
    folderName: 'creator-1',
    name: 'Test Creator',
    profileImagePath: null,
    youtubeChannelId: null,
    youtubeChannelUrl: null,
    subscriberCount: null,
    avatarUrl: null,
    status: 'active',
    deletedAt: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides
  }
}

describe('SqliteCreatorRepository', () => {
  let database: DatabaseInstance
  let repo: SqliteCreatorRepository

  beforeEach(() => {
    database = createTestDb()
    repo = new SqliteCreatorRepository(database.db)
  })

  afterEach(() => {
    database.raw.close()
  })

  // ── findAll ──

  it('returns an empty array when no creators exist', () => {
    expect(repo.findAll()).toEqual([])
  })

  it('returns all creators ordered by name ASC', () => {
    repo.upsert(makeCreator({ id: 'c-2', folderName: 'c-2', name: 'Bravo' }))
    repo.upsert(makeCreator({ id: 'c-1', folderName: 'c-1', name: 'Alpha' }))
    repo.upsert(makeCreator({ id: 'c-3', folderName: 'c-3', name: 'Charlie' }))

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

  // ── findByFolderName ──

  it('returns null for a non-existent folder name', () => {
    expect(repo.findByFolderName('nope')).toBeNull()
  })

  it('returns the creator by folder name', () => {
    const creator = makeCreator()
    repo.upsert(creator)
    expect(repo.findByFolderName('creator-1')?.id).toBe('creator-1')
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
        const padded = String(i).padStart(2, '0')
        repo.upsert(
          makeCreator({
            id: `c-${padded}`,
            folderName: `c-${padded}`,
            name: `Creator ${padded}`
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
    repo.upsert(makeCreator({ id: 'c-1', folderName: 'c-1', name: 'Active' }))
    repo.upsert(makeCreator({ id: 'c-2', folderName: 'c-2', name: 'Missing', status: 'missing' }))
    repo.upsert(
      makeCreator({
        id: 'c-3',
        folderName: 'c-3',
        name: 'Deleted',
        status: 'deleted',
        deletedAt: '2025-06-01'
      })
    )

    const active = repo.findAllActive()
    expect(active).toHaveLength(1)
    expect(active[0].name).toBe('Active')
  })

  describe('searchByName', () => {
    it('returns an empty array for an empty query', () => {
      repo.upsert(makeCreator({ id: 'c-1', name: 'anyone' }))
      expect(repo.searchByName('', 10)).toEqual([])
      expect(repo.searchByName('   ', 10)).toEqual([])
    })

    it('matches case-insensitive substrings of the name', () => {
      repo.upsert(makeCreator({ id: 'c-1', folderName: 'a', name: 'Alpha Tech' }))
      repo.upsert(makeCreator({ id: 'c-2', folderName: 'b', name: 'Beta Lab' }))
      repo.upsert(makeCreator({ id: 'c-3', folderName: 'c', name: 'Gamma Studio' }))

      const results = repo.searchByName('beta', 10)
      expect(results.map((c) => c.id)).toEqual(['c-2'])
    })

    it('caps results to limit, ordered alphabetically', () => {
      repo.upsert(makeCreator({ id: 'c-1', folderName: 'a', name: 'Search Alpha' }))
      repo.upsert(makeCreator({ id: 'c-2', folderName: 'b', name: 'Search Bravo' }))
      repo.upsert(makeCreator({ id: 'c-3', folderName: 'c', name: 'Search Charlie' }))

      const results = repo.searchByName('search', 2)
      expect(results.map((c) => c.name)).toEqual(['Search Alpha', 'Search Bravo'])
    })

    it('skips deleted and missing creators', () => {
      repo.upsert(makeCreator({ id: 'live', folderName: 'live', name: 'Live Show' }))
      repo.upsert(
        makeCreator({
          id: 'gone',
          folderName: 'gone',
          name: 'Live Stream',
          status: 'deleted',
          deletedAt: '2025-06-01'
        })
      )

      const results = repo.searchByName('live', 10)
      expect(results.map((c) => c.id)).toEqual(['live'])
    })

    it('escapes LIKE wildcards in the query', () => {
      repo.upsert(makeCreator({ id: 'c-1', folderName: 'pct', name: '50% off' }))
      repo.upsert(makeCreator({ id: 'c-2', folderName: 'plain', name: 'Plain name' }))

      const results = repo.searchByName('%', 10)
      expect(results.map((c) => c.id)).toEqual(['c-1'])
    })
  })
})
