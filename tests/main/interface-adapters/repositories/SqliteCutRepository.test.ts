import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  SqliteCreatorRepository,
  SqliteVideoRepository,
  SqliteCutRepository
} from '@main/interface-adapters/repositories'
import type { Creator, Video, Cut } from '@domain/entities'
import { createTestDb } from '../../helpers/createTestDb'

// ── factories ──

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

function makeVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: 'video-1',
    creatorId: 'creator-1',
    title: 'Test Video',
    url: null,
    duration: 120,
    resolution: '1920x1080',
    fileSize: 50_000_000,
    filePath: '/videos/test.mp4',
    thumbnailPath: null,
    downloadDate: null,
    status: 'active',
    deletedAt: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides
  }
}

function makeCut(overrides: Partial<Cut> = {}): Cut {
  return {
    id: 'cut-1',
    creatorId: 'creator-1',
    videoId: 'video-1',
    title: 'Test Cut',
    tags: ['funny', 'highlight'],
    startTimestamp: 10.5,
    endTimestamp: 30.0,
    duration: 20,
    resolution: '1920x1080',
    fileSize: 10_000_000,
    filePath: '/cuts/cut1.mp4',
    thumbnailPath: null,
    status: 'active',
    deletedAt: null,
    createdAt: '2025-01-03T00:00:00.000Z',
    updatedAt: '2025-01-03T00:00:00.000Z',
    ...overrides
  }
}

describe('SqliteCutRepository', () => {
  let db: ReturnType<typeof createTestDb>
  let creatorRepo: SqliteCreatorRepository
  let videoRepo: SqliteVideoRepository
  let cutRepo: SqliteCutRepository

  beforeEach(() => {
    db = createTestDb()
    creatorRepo = new SqliteCreatorRepository(db)
    videoRepo = new SqliteVideoRepository(db)
    cutRepo = new SqliteCutRepository(db)

    // FK prerequisites
    creatorRepo.upsert(makeCreator())
    videoRepo.upsert(makeVideo())
  })

  afterEach(() => {
    db.close()
  })

  // ── findAll ──

  it('returns an empty array when no cuts exist', () => {
    expect(cutRepo.findAll()).toEqual([])
  })

  it('returns all cuts ordered by created_at DESC', () => {
    cutRepo.upsert(makeCut({ id: 'c-1', createdAt: '2025-01-01T00:00:00.000Z' }))
    cutRepo.upsert(makeCut({ id: 'c-2', createdAt: '2025-03-01T00:00:00.000Z' }))
    cutRepo.upsert(makeCut({ id: 'c-3', createdAt: '2025-02-01T00:00:00.000Z' }))

    const ids = cutRepo.findAll().map((c) => c.id)
    expect(ids).toEqual(['c-2', 'c-3', 'c-1'])
  })

  // ── findById ──

  it('returns null for a non-existent id', () => {
    expect(cutRepo.findById('ghost')).toBeNull()
  })

  it('returns the cut for a valid id', () => {
    const cut = makeCut()
    cutRepo.upsert(cut)
    expect(cutRepo.findById('cut-1')).toEqual(cut)
  })

  // ── findByCreatorId ──

  it('returns only cuts belonging to a creator', () => {
    creatorRepo.upsert(makeCreator({ id: 'creator-2', name: 'Other' }))
    cutRepo.upsert(makeCut({ id: 'c-1', creatorId: 'creator-1' }))
    cutRepo.upsert(makeCut({ id: 'c-2', creatorId: 'creator-2', videoId: null }))

    const results = cutRepo.findByCreatorId('creator-1')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('c-1')
  })

  // ── findByVideoId ──

  it('returns only cuts linked to a specific video', () => {
    videoRepo.upsert(makeVideo({ id: 'video-2', title: 'Other' }))
    cutRepo.upsert(makeCut({ id: 'c-1', videoId: 'video-1' }))
    cutRepo.upsert(makeCut({ id: 'c-2', videoId: 'video-2' }))

    const results = cutRepo.findByVideoId('video-1')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('c-1')
  })

  // ── findByTags ──

  it('returns empty array when tags list is empty', () => {
    cutRepo.upsert(makeCut())
    expect(cutRepo.findByTags([])).toEqual([])
  })

  it('returns cuts matching ANY of the given tags', () => {
    cutRepo.upsert(makeCut({ id: 'c-1', tags: ['funny', 'highlight'] }))
    cutRepo.upsert(makeCut({ id: 'c-2', tags: ['serious'] }))
    cutRepo.upsert(makeCut({ id: 'c-3', tags: ['highlight', 'clip'] }))

    const results = cutRepo.findByTags(['funny'])
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('c-1')
  })

  // ── upsert ──

  it('inserts a new cut', () => {
    cutRepo.upsert(makeCut())
    expect(cutRepo.findAll()).toHaveLength(1)
  })

  it('updates an existing cut on conflict', () => {
    cutRepo.upsert(makeCut({ title: 'Original' }))
    cutRepo.upsert(makeCut({ title: 'Updated' }))

    const result = cutRepo.findById('cut-1')
    expect(result?.title).toBe('Updated')
    expect(cutRepo.findAll()).toHaveLength(1)
  })

  it('round-trips tags as JSON array', () => {
    cutRepo.upsert(makeCut({ tags: ['a', 'b', 'c'] }))
    const result = cutRepo.findById('cut-1')
    expect(result?.tags).toEqual(['a', 'b', 'c'])
  })

  // ── delete ──

  it('deletes a cut by id', () => {
    cutRepo.upsert(makeCut())
    cutRepo.delete('cut-1')
    expect(cutRepo.findById('cut-1')).toBeNull()
  })

  // ── findPaginated ──

  describe('findPaginated', () => {
    beforeEach(() => {
      for (let i = 1; i <= 20; i++) {
        cutRepo.upsert(
          makeCut({
            id: `c-${String(i).padStart(2, '0')}`,
            title: `Cut ${String(i).padStart(2, '0')}`,
            tags: i % 2 === 0 ? ['even'] : ['odd'],
            createdAt: `2025-01-${String(i).padStart(2, '0')}T00:00:00.000Z`
          })
        )
      }
    })

    it('returns page 1 with correct metadata', () => {
      const result = cutRepo.findPaginated({ page: 1, pageSize: 5 })
      expect(result.data).toHaveLength(5)
      expect(result.total).toBe(20)
      expect(result.totalPages).toBe(4)
    })

    it('filters by creatorId', () => {
      creatorRepo.upsert(makeCreator({ id: 'creator-2', name: 'Other' }))
      cutRepo.upsert(makeCut({ id: 'c-extra', creatorId: 'creator-2', videoId: null }))

      const result = cutRepo.findPaginated({ page: 1, pageSize: 50, creatorId: 'creator-2' })
      expect(result.total).toBe(1)
    })

    it('filters by videoId', () => {
      videoRepo.upsert(makeVideo({ id: 'video-2', title: 'V2' }))
      cutRepo.upsert(makeCut({ id: 'c-extra', videoId: 'video-2' }))

      const result = cutRepo.findPaginated({ page: 1, pageSize: 50, videoId: 'video-2' })
      expect(result.total).toBe(1)
      expect(result.data[0].id).toBe('c-extra')
    })

    it('filters by tags using EXISTS (no inflated count)', () => {
      const result = cutRepo.findPaginated({ page: 1, pageSize: 50, tags: ['even'] })
      expect(result.total).toBe(10) // exactly half are tagged "even"
      result.data.forEach((c) => expect(c.tags).toContain('even'))
    })

    it('filters by search term on title', () => {
      const result = cutRepo.findPaginated({ page: 1, pageSize: 50, search: 'Cut 01' })
      expect(result.total).toBe(1)
    })

    it('sorts by title descending', () => {
      const result = cutRepo.findPaginated({
        page: 1,
        pageSize: 3,
        sortBy: 'title',
        sortDirection: 'desc'
      })
      expect(result.data[0].title).toBe('Cut 20')
    })

    it('falls back to default sort for unknown column (SQL-injection guard)', () => {
      const result = cutRepo.findPaginated({
        page: 1,
        pageSize: 3,
        sortBy: "'; DROP TABLE cuts;--"
      })
      // Must not throw; falls back to created_at ASC
      expect(result.data).toHaveLength(3)
    })

    it('combines multiple filters correctly', () => {
      const result = cutRepo.findPaginated({
        page: 1,
        pageSize: 50,
        tags: ['odd'],
        search: 'Cut 0'
      })
      // "Cut 01" through "Cut 09" — only odd ones: 01,03,05,07,09 = 5
      expect(result.total).toBe(5)
    })
  })
})




