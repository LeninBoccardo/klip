import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  SqliteCreatorRepository,
  SqliteVideoRepository,
  SqliteCutRepository
} from '@main/interface-adapters/repositories'
import type { Creator, Video, Cut } from '@domain/entities'
import type { DatabaseInstance } from '@main/framework-drivers/database'
import { createTestDb } from '../../helpers/createTestDb'

// ── factories ──

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
  let database: DatabaseInstance
  let creatorRepo: SqliteCreatorRepository
  let videoRepo: SqliteVideoRepository
  let cutRepo: SqliteCutRepository

  beforeEach(() => {
    database = createTestDb()
    creatorRepo = new SqliteCreatorRepository(database.db)
    videoRepo = new SqliteVideoRepository(database.db)
    cutRepo = new SqliteCutRepository(database.db)

    // FK prerequisites
    creatorRepo.upsert(makeCreator())
    videoRepo.upsert(makeVideo())
  })

  afterEach(() => {
    database.raw.close()
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
    creatorRepo.upsert(makeCreator({ id: 'creator-2', folderName: 'creator-2', name: 'Other' }))
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

  it('returns cuts matching multiple tags (OR semantics) without duplicates', () => {
    cutRepo.upsert(makeCut({ id: 'c-1', tags: ['funny', 'highlight'] }))
    cutRepo.upsert(makeCut({ id: 'c-2', tags: ['serious'] }))
    cutRepo.upsert(makeCut({ id: 'c-3', tags: ['highlight', 'clip'] }))

    const results = cutRepo.findByTags(['funny', 'highlight'])
    const ids = results.map((c) => c.id).sort()
    // c-1 has both tags but should appear only once; c-3 has 'highlight'
    expect(ids).toEqual(['c-1', 'c-3'])
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

  it('returns empty array for malformed JSON tags instead of crashing', () => {
    // Directly insert a row with invalid JSON in the tags column
    database.raw
      .prepare(
        `INSERT INTO cuts (id, creator_id, video_id, title, tags, file_path, status, created_at, updated_at)
       VALUES ('bad-tags', 'creator-1', 'video-1', 'Bad', 'NOT_JSON', '/test', 'active', datetime('now'), datetime('now'))`
      )
      .run()

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = cutRepo.findById('bad-tags')
    expect(result).not.toBeNull()
    expect(result!.tags).toEqual([])
    consoleSpy.mockRestore()
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
      creatorRepo.upsert(makeCreator({ id: 'creator-2', folderName: 'creator-2', name: 'Other' }))
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

  // ── updateStatus ──

  it('sets status and deletedAt', () => {
    cutRepo.upsert(makeCut())
    cutRepo.updateStatus('cut-1', 'deleted', '2025-06-01T00:00:00.000Z')

    const result = cutRepo.findById('cut-1')
    expect(result?.status).toBe('deleted')
    expect(result?.deletedAt).toBe('2025-06-01T00:00:00.000Z')
  })

  it('updateStatus + findPaginated: missing cuts excluded by default filter', () => {
    cutRepo.upsert(makeCut({ id: 'c-a' }))
    cutRepo.upsert(makeCut({ id: 'c-b' }))
    cutRepo.updateStatus('c-a', 'missing', null)

    const result = cutRepo.findPaginated({ page: 1, pageSize: 50 })
    expect(result.total).toBe(1)
    expect(result.data[0].id).toBe('c-b')
  })

  // ── findByCreatorId returns all statuses ──

  it('findByCreatorId returns cuts of all statuses', () => {
    cutRepo.upsert(makeCut({ id: 'c-active', status: 'active' }))
    cutRepo.upsert(makeCut({ id: 'c-missing', status: 'missing' }))
    cutRepo.upsert(makeCut({ id: 'c-deleted', status: 'deleted', deletedAt: '2025-06-01' }))

    const results = cutRepo.findByCreatorId('creator-1')
    expect(results).toHaveLength(3)
    const ids = results.map((c) => c.id).sort()
    expect(ids).toEqual(['c-active', 'c-deleted', 'c-missing'])
  })

  // ── findAllActive ──

  it('returns only active cuts', () => {
    cutRepo.upsert(makeCut({ id: 'c-1', status: 'active' }))
    cutRepo.upsert(makeCut({ id: 'c-2', status: 'missing' }))
    cutRepo.upsert(makeCut({ id: 'c-3', status: 'deleted', deletedAt: '2025-06-01' }))

    const active = cutRepo.findAllActive()
    expect(active).toHaveLength(1)
    expect(active[0].id).toBe('c-1')
  })

  // ── Edge cases: sort columns ──

  describe('findPaginated sort columns', () => {
    beforeEach(() => {
      cutRepo.upsert(
        makeCut({
          id: 'c-short',
          title: 'Short',
          duration: 5,
          startTimestamp: 10,
          endTimestamp: 15
        })
      )
      cutRepo.upsert(
        makeCut({
          id: 'c-long',
          title: 'Long',
          duration: 60,
          startTimestamp: 100,
          endTimestamp: 160
        })
      )
    })

    it('sorts by duration ascending', () => {
      const result = cutRepo.findPaginated({
        page: 1,
        pageSize: 10,
        sortBy: 'duration',
        sortDirection: 'asc'
      })
      expect(result.data[0].id).toBe('c-short')
    })

    it('sorts by startTimestamp descending', () => {
      const result = cutRepo.findPaginated({
        page: 1,
        pageSize: 10,
        sortBy: 'startTimestamp',
        sortDirection: 'desc'
      })
      expect(result.data[0].id).toBe('c-long')
    })

    it('sorts by endTimestamp ascending', () => {
      const result = cutRepo.findPaginated({
        page: 1,
        pageSize: 10,
        sortBy: 'endTimestamp',
        sortDirection: 'asc'
      })
      expect(result.data[0].id).toBe('c-short')
    })
  })

  // ── Edge cases: FK ON DELETE SET NULL ──

  it('sets videoId to null when linked video is deleted (FK SET NULL)', () => {
    cutRepo.upsert(makeCut({ id: 'c-linked', videoId: 'video-1' }))
    expect(cutRepo.findById('c-linked')?.videoId).toBe('video-1')

    videoRepo.delete('video-1')

    const updated = cutRepo.findById('c-linked')
    expect(updated).not.toBeNull()
    expect(updated!.videoId).toBeNull()
  })

  // ── Edge cases: FK CASCADE from creator ──

  it('cascade deletes cuts when creator is deleted', () => {
    cutRepo.upsert(makeCut({ id: 'c-1' }))
    cutRepo.upsert(makeCut({ id: 'c-2' }))
    expect(cutRepo.findAll()).toHaveLength(2)

    creatorRepo.delete('creator-1')

    expect(cutRepo.findAll()).toEqual([])
  })

  // ── Edge cases: cuts without a linked video ──

  it('inserts and retrieves a cut with null videoId', () => {
    cutRepo.upsert(makeCut({ id: 'c-no-video', videoId: null }))

    const result = cutRepo.findById('c-no-video')
    expect(result).not.toBeNull()
    expect(result!.videoId).toBeNull()
  })

  it('findByVideoId does not return cuts with null videoId', () => {
    cutRepo.upsert(makeCut({ id: 'c-linked', videoId: 'video-1' }))
    cutRepo.upsert(makeCut({ id: 'c-unlinked', videoId: null }))

    const results = cutRepo.findByVideoId('video-1')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('c-linked')
  })

  // ── Edge cases: findByTags with special characters ──

  it('findByTags handles tags with special characters', () => {
    cutRepo.upsert(makeCut({ id: 'c-special', tags: ['c++', 'c#', 'node.js'] }))

    const results = cutRepo.findByTags(['c++'])
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('c-special')
  })

  it('findByTags handles tags with unicode characters', () => {
    cutRepo.upsert(makeCut({ id: 'c-unicode', tags: ['日本語', 'español'] }))

    const results = cutRepo.findByTags(['日本語'])
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('c-unicode')
  })

  // ── Edge cases: empty tags array ──

  it('round-trips empty tags array', () => {
    cutRepo.upsert(makeCut({ id: 'c-empty-tags', tags: [] }))
    const result = cutRepo.findById('c-empty-tags')
    expect(result?.tags).toEqual([])
  })

  // ── Edge cases: tags column default ──

  it('uses default empty JSON array when tags column omitted', () => {
    // Insert without specifying tags — relies on schema default of '[]'
    database.raw
      .prepare(
        `INSERT INTO cuts (id, creator_id, video_id, title, file_path, status, created_at, updated_at)
       VALUES ('default-tags', 'creator-1', 'video-1', 'Default', '/test', 'active', datetime('now'), datetime('now'))`
      )
      .run()

    const result = cutRepo.findById('default-tags')
    expect(result).not.toBeNull()
    expect(result!.tags).toEqual([])
  })

  // ── Edge cases: findPaginated multiple statuses ──

  it('findPaginated filters by multiple statuses', () => {
    cutRepo.upsert(makeCut({ id: 'c-active', status: 'active' }))
    cutRepo.upsert(makeCut({ id: 'c-missing', status: 'missing' }))
    cutRepo.upsert(makeCut({ id: 'c-deleted', status: 'deleted', deletedAt: '2025-06-01' }))

    const result = cutRepo.findPaginated({
      page: 1,
      pageSize: 50,
      status: ['active', 'missing']
    })
    expect(result.total).toBe(2)
  })
})
