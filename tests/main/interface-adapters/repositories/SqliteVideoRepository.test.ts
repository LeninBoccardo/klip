import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  SqliteCreatorRepository,
  SqliteVideoRepository
} from '@main/interface-adapters/repositories'
import type { Creator } from '@domain/entities'
import type { Video } from '@domain/entities'
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
    url: 'https://youtube.com/watch?v=abc',
    duration: 120,
    resolution: '1920x1080',
    fileSize: 50_000_000,
    filePath: '/videos/test.mp4',
    thumbnailPath: '/videos/thumb.jpg',
    downloadDate: '2025-01-02T00:00:00.000Z',
    status: 'active',
    deletedAt: null,
    createdAt: '2025-01-02T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
    ...overrides
  }
}

describe('SqliteVideoRepository', () => {
  let database: DatabaseInstance
  let videoRepo: SqliteVideoRepository
  let creatorRepo: SqliteCreatorRepository

  beforeEach(() => {
    database = createTestDb()
    creatorRepo = new SqliteCreatorRepository(database.db)
    videoRepo = new SqliteVideoRepository(database.db)
    // FK constraint: creator must exist first
    creatorRepo.upsert(makeCreator())
  })

  afterEach(() => {
    database.raw.close()
  })

  // ── findAll ──

  it('returns an empty array when no videos exist', () => {
    expect(videoRepo.findAll()).toEqual([])
  })

  it('returns all videos ordered by created_at DESC', () => {
    videoRepo.upsert(makeVideo({ id: 'v-1', createdAt: '2025-01-01T00:00:00.000Z' }))
    videoRepo.upsert(makeVideo({ id: 'v-2', createdAt: '2025-03-01T00:00:00.000Z' }))
    videoRepo.upsert(makeVideo({ id: 'v-3', createdAt: '2025-02-01T00:00:00.000Z' }))

    const ids = videoRepo.findAll().map((v) => v.id)
    expect(ids).toEqual(['v-2', 'v-3', 'v-1'])
  })

  // ── findById ──

  it('returns null for a non-existent id', () => {
    expect(videoRepo.findById('ghost')).toBeNull()
  })

  it('returns the video for a valid id', () => {
    const video = makeVideo()
    videoRepo.upsert(video)
    expect(videoRepo.findById('video-1')).toEqual(video)
  })

  // ── findByCreatorId ──

  it('returns only videos belonging to the given creator', () => {
    creatorRepo.upsert(makeCreator({ id: 'creator-2', folderName: 'creator-2', name: 'Other' }))
    videoRepo.upsert(makeVideo({ id: 'v-1', creatorId: 'creator-1' }))
    videoRepo.upsert(makeVideo({ id: 'v-2', creatorId: 'creator-2' }))

    const results = videoRepo.findByCreatorId('creator-1')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('v-1')
  })

  // ── upsert ──

  it('inserts a new video', () => {
    videoRepo.upsert(makeVideo())
    expect(videoRepo.findAll()).toHaveLength(1)
  })

  it('updates an existing video on conflict', () => {
    videoRepo.upsert(makeVideo({ title: 'Original' }))
    videoRepo.upsert(makeVideo({ title: 'Updated' }))

    const result = videoRepo.findById('video-1')
    expect(result?.title).toBe('Updated')
    expect(videoRepo.findAll()).toHaveLength(1)
  })

  // ── delete ──

  it('deletes a video by id', () => {
    videoRepo.upsert(makeVideo())
    videoRepo.delete('video-1')
    expect(videoRepo.findById('video-1')).toBeNull()
  })

  // ── findPaginated ──

  describe('findPaginated', () => {
    beforeEach(() => {
      for (let i = 1; i <= 15; i++) {
        videoRepo.upsert(
          makeVideo({
            id: `v-${String(i).padStart(2, '0')}`,
            title: `Video ${String(i).padStart(2, '0')}`,
            createdAt: `2025-01-${String(i).padStart(2, '0')}T00:00:00.000Z`
          })
        )
      }
    })

    it('returns page 1 with correct metadata', () => {
      const result = videoRepo.findPaginated({ page: 1, pageSize: 5 })
      expect(result.data).toHaveLength(5)
      expect(result.total).toBe(15)
      expect(result.totalPages).toBe(3)
    })

    it('filters by creatorId', () => {
      creatorRepo.upsert(makeCreator({ id: 'creator-2', folderName: 'creator-2', name: 'Other' }))
      videoRepo.upsert(makeVideo({ id: 'v-other', creatorId: 'creator-2', title: 'Other' }))

      const result = videoRepo.findPaginated({ page: 1, pageSize: 50, creatorId: 'creator-2' })
      expect(result.total).toBe(1)
      expect(result.data[0].id).toBe('v-other')
    })

    it('filters by search term on title', () => {
      const result = videoRepo.findPaginated({ page: 1, pageSize: 50, search: 'Video 01' })
      expect(result.total).toBe(1)
    })

    it('sorts by title ascending', () => {
      const result = videoRepo.findPaginated({
        page: 1,
        pageSize: 3,
        sortBy: 'title',
        sortDirection: 'asc'
      })
      expect(result.data[0].title).toBe('Video 01')
    })

    it('falls back to default sort for unknown column', () => {
      const result = videoRepo.findPaginated({
        page: 1,
        pageSize: 3,
        sortBy: 'nonexistent'
      })
      // default is created_at ASC → first row is earliest date
      expect(result.data).toHaveLength(3)
    })
  })

  // ── updateStatus ──

  it('sets status and deletedAt', () => {
    videoRepo.upsert(makeVideo())
    videoRepo.updateStatus('video-1', 'deleted', '2025-06-01T00:00:00.000Z')

    const result = videoRepo.findById('video-1')
    expect(result?.status).toBe('deleted')
    expect(result?.deletedAt).toBe('2025-06-01T00:00:00.000Z')
  })

  it('updateStatus + findPaginated: missing videos excluded by default filter', () => {
    videoRepo.upsert(makeVideo({ id: 'v-1' }))
    videoRepo.upsert(makeVideo({ id: 'v-2' }))
    videoRepo.updateStatus('v-1', 'missing', null)

    const result = videoRepo.findPaginated({ page: 1, pageSize: 50 })
    expect(result.total).toBe(1)
    expect(result.data[0].id).toBe('v-2')
  })

  // ── findByCreatorId returns all statuses ──

  it('findByCreatorId returns videos of all statuses', () => {
    videoRepo.upsert(makeVideo({ id: 'v-active', status: 'active' }))
    videoRepo.upsert(makeVideo({ id: 'v-missing', status: 'missing' }))
    videoRepo.upsert(makeVideo({ id: 'v-deleted', status: 'deleted', deletedAt: '2025-06-01' }))

    const results = videoRepo.findByCreatorId('creator-1')
    expect(results).toHaveLength(3)
    const ids = results.map((v) => v.id).sort()
    expect(ids).toEqual(['v-active', 'v-deleted', 'v-missing'])
  })

  // ── findAllActive ──

  it('returns only active videos', () => {
    videoRepo.upsert(makeVideo({ id: 'v-1', status: 'active' }))
    videoRepo.upsert(makeVideo({ id: 'v-2', status: 'missing' }))
    videoRepo.upsert(makeVideo({ id: 'v-3', status: 'deleted', deletedAt: '2025-06-01' }))

    const active = videoRepo.findAllActive()
    expect(active).toHaveLength(1)
    expect(active[0].id).toBe('v-1')
  })

  // ── Edge cases: sort columns ──

  describe('findPaginated sort columns', () => {
    beforeEach(() => {
      videoRepo.upsert(
        makeVideo({
          id: 'v-short',
          title: 'Short',
          duration: 30,
          fileSize: 1_000_000,
          downloadDate: '2025-01-01T00:00:00.000Z'
        })
      )
      videoRepo.upsert(
        makeVideo({
          id: 'v-long',
          title: 'Long',
          duration: 600,
          fileSize: 100_000_000,
          downloadDate: '2025-06-01T00:00:00.000Z'
        })
      )
    })

    it('sorts by duration ascending', () => {
      const result = videoRepo.findPaginated({
        page: 1,
        pageSize: 10,
        sortBy: 'duration',
        sortDirection: 'asc'
      })
      expect(result.data[0].id).toBe('v-short')
    })

    it('sorts by duration descending', () => {
      const result = videoRepo.findPaginated({
        page: 1,
        pageSize: 10,
        sortBy: 'duration',
        sortDirection: 'desc'
      })
      expect(result.data[0].id).toBe('v-long')
    })

    it('sorts by fileSize ascending', () => {
      const result = videoRepo.findPaginated({
        page: 1,
        pageSize: 10,
        sortBy: 'fileSize',
        sortDirection: 'asc'
      })
      expect(result.data[0].id).toBe('v-short')
    })

    it('sorts by downloadDate descending', () => {
      const result = videoRepo.findPaginated({
        page: 1,
        pageSize: 10,
        sortBy: 'downloadDate',
        sortDirection: 'desc'
      })
      expect(result.data[0].id).toBe('v-long')
    })
  })

  // ── Edge cases: multiple statuses filter ──

  it('findPaginated filters by multiple statuses', () => {
    videoRepo.upsert(makeVideo({ id: 'v-active', status: 'active' }))
    videoRepo.upsert(makeVideo({ id: 'v-missing', status: 'missing' }))
    videoRepo.upsert(makeVideo({ id: 'v-deleted', status: 'deleted', deletedAt: '2025-06-01' }))

    const result = videoRepo.findPaginated({
      page: 1,
      pageSize: 50,
      status: ['active', 'missing']
    })
    expect(result.total).toBe(2)
    const ids = result.data.map((v) => v.id).sort()
    expect(ids).toEqual(['v-active', 'v-missing'])
  })

  // ── Edge cases: search with no results ──

  it('findPaginated search returning no results', () => {
    videoRepo.upsert(makeVideo({ title: 'Cooking Tutorial' }))
    const result = videoRepo.findPaginated({
      page: 1,
      pageSize: 50,
      search: 'NonExistentSearchTerm'
    })
    expect(result.total).toBe(0)
    expect(result.data).toEqual([])
  })

  // ── FK cascade: creator deletion cascades to videos ──

  it('cascade deletes videos when creator is deleted', () => {
    videoRepo.upsert(makeVideo({ id: 'v-1' }))
    videoRepo.upsert(makeVideo({ id: 'v-2' }))
    expect(videoRepo.findAll()).toHaveLength(2)

    creatorRepo.delete('creator-1')

    expect(videoRepo.findAll()).toEqual([])
    expect(videoRepo.findById('v-1')).toBeNull()
  })

  // ── Edge cases: null optional fields ──

  it('handles video with all nullable fields set to null', () => {
    videoRepo.upsert(
      makeVideo({
        id: 'v-nulls',
        url: null,
        duration: null,
        resolution: null,
        fileSize: null,
        thumbnailPath: null,
        downloadDate: null,
        deletedAt: null
      })
    )

    const result = videoRepo.findById('v-nulls')
    expect(result).not.toBeNull()
    expect(result!.url).toBeNull()
    expect(result!.duration).toBeNull()
    expect(result!.resolution).toBeNull()
    expect(result!.fileSize).toBeNull()
    expect(result!.thumbnailPath).toBeNull()
    expect(result!.downloadDate).toBeNull()
  })
})
