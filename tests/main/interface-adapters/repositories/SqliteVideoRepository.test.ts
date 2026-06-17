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
    youtubeChannelId: null,
    youtubeChannelUrl: null,
    subscriberCount: null,
    avatarUrl: null,
    notes: null,
    tags: [],
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
    probeStatus: 'complete',
    viewCount: null,
    likeCount: null,
    dislikeCount: null,
    commentCount: null,
    category: null,
    tags: [],
    uploadDate: null,
    description: null,
    isShort: false,
    transcriptPath: null,
    transcriptText: null,
    detailFetchedAt: null,
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

  // ── updateProbeResult ──

  it('updateProbeResult writes only the probe columns, preserving other fields (F10)', () => {
    videoRepo.upsert(
      makeVideo({
        id: 'video-1',
        status: 'active',
        viewCount: 999,
        title: 'Keep me',
        probeStatus: 'pending',
        duration: null,
        resolution: null,
        fileSize: null
      })
    )

    videoRepo.updateProbeResult('video-1', {
      duration: 120,
      resolution: '1920x1080',
      fileSize: 5_000_000,
      probeStatus: 'complete'
    })

    expect(videoRepo.findById('video-1')).toMatchObject({
      duration: 120,
      resolution: '1920x1080',
      fileSize: 5_000_000,
      probeStatus: 'complete',
      // Columns the probe write must NOT touch — a stale full-row upsert would
      // have reverted these.
      status: 'active',
      viewCount: 999,
      title: 'Keep me'
    })
  })

  // ── updateDetail ──

  it('updateDetail writes only the detail columns, preserving probe columns (F21)', () => {
    videoRepo.upsert(
      makeVideo({
        id: 'video-1',
        status: 'active',
        title: 'Keep me',
        // probe columns a concurrent EnrichMediaMetadata would have just written
        duration: 300,
        resolution: '3840x2160',
        fileSize: 9_000_000,
        probeStatus: 'complete',
        // detail columns start empty
        viewCount: null,
        likeCount: null,
        tags: [],
        transcriptText: null,
        detailFetchedAt: null
      })
    )

    videoRepo.updateDetail('video-1', {
      viewCount: 5000,
      likeCount: 100,
      dislikeCount: 2,
      commentCount: 25,
      category: 'Music',
      tags: ['rock', 'live'],
      uploadDate: '2024-03-15',
      description: 'A song',
      isShort: false,
      transcriptPath: '/videos/transcript.en.vtt',
      transcriptText: 'Hello world',
      detailFetchedAt: '2025-02-01T00:00:00.000Z'
    })

    expect(videoRepo.findById('video-1')).toMatchObject({
      // detail columns updated
      viewCount: 5000,
      likeCount: 100,
      commentCount: 25,
      category: 'Music',
      tags: ['rock', 'live'],
      isShort: false,
      transcriptText: 'Hello world',
      detailFetchedAt: '2025-02-01T00:00:00.000Z',
      // probe columns the detail write must NOT touch — a stale full-row upsert
      // would have reverted these to the pre-probe snapshot (the F21 race).
      duration: 300,
      resolution: '3840x2160',
      fileSize: 9_000_000,
      probeStatus: 'complete',
      status: 'active',
      title: 'Keep me'
    })
  })

  // ── findByIds ──

  it('findByIds returns the matching videos and [] for an empty id list (F43)', () => {
    videoRepo.upsert(makeVideo({ id: 'v-1' }))
    videoRepo.upsert(makeVideo({ id: 'v-2' }))
    videoRepo.upsert(makeVideo({ id: 'v-3' }))

    expect(videoRepo.findByIds([]).map((v) => v.id)).toEqual([])
    expect(
      videoRepo
        .findByIds(['v-1', 'v-3', 'missing'])
        .map((v) => v.id)
        .sort()
    ).toEqual(['v-1', 'v-3'])
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

    it('filters by search term on title (asserts the matching row, not just the count)', () => {
      // The previous version asserted only `total === 1`; if the LIKE clause
      // hit a different column (description, url, …) the test would still
      // pass because the fixture has a single row whose title contains
      // "Video 01". Now we verify the actual row identity.
      const result = videoRepo.findPaginated({ page: 1, pageSize: 50, search: 'Video 01' })
      expect(result.total).toBe(1)
      expect(result.data).toHaveLength(1)
      expect(result.data[0].title).toContain('Video 01')
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

    it('uses id DESC as a tiebreaker so paginated rows with identical sort keys never duplicate or skip', () => {
      // 5 rows, all identical createdAt. Without a tiebreaker, SQLite is free
      // to reorder ties between queries — paginating could double-count or
      // miss a row.
      const sameTimestamp = '2025-04-01T12:00:00.000Z'
      const ids = ['v-a', 'v-b', 'v-c', 'v-d', 'v-e']
      for (const id of ids) {
        videoRepo.upsert(
          makeVideo({
            id,
            title: id,
            createdAt: sameTimestamp,
            updatedAt: sameTimestamp
          })
        )
      }

      const seen = new Set<string>()
      for (let page = 1; page <= 3; page++) {
        const result = videoRepo.findPaginated({
          page,
          pageSize: 2,
          sortBy: 'createdAt',
          sortDirection: 'desc'
        })
        for (const row of result.data) {
          // Each id must appear exactly once across the run.
          expect(seen.has(row.id)).toBe(false)
          seen.add(row.id)
        }
      }
      // All 5 distinct ids retrieved (plus the two from the outer beforeEach).
      for (const id of ids) {
        expect(seen.has(id)).toBe(true)
      }
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

  // ── updateFilePathPrefix ──

  describe('updateFilePathPrefix', () => {
    it('replaces path prefix in filePath and thumbnailPath for all videos', () => {
      creatorRepo.upsert(makeCreator())
      videoRepo.upsert(
        makeVideo({
          id: 'v1',
          filePath: '/old/root/creator-1/downloads/v1/video.mp4',
          thumbnailPath: '/old/root/creator-1/downloads/v1/thumb.jpg'
        })
      )
      videoRepo.upsert(
        makeVideo({
          id: 'v2',
          filePath: '/old/root/creator-1/downloads/v2/video.mp4',
          thumbnailPath: '/old/root/creator-1/downloads/v2/thumb.jpg'
        })
      )

      videoRepo.updateFilePathPrefix('/old/root', '/new/root')

      const v1 = videoRepo.findById('v1')!
      expect(v1.filePath).toBe('/new/root/creator-1/downloads/v1/video.mp4')
      expect(v1.thumbnailPath).toBe('/new/root/creator-1/downloads/v1/thumb.jpg')

      const v2 = videoRepo.findById('v2')!
      expect(v2.filePath).toBe('/new/root/creator-1/downloads/v2/video.mp4')
      expect(v2.thumbnailPath).toBe('/new/root/creator-1/downloads/v2/thumb.jpg')
    })

    it('leaves null thumbnailPath as null', () => {
      creatorRepo.upsert(makeCreator())
      videoRepo.upsert(
        makeVideo({ id: 'v-null', filePath: '/old/root/test.mp4', thumbnailPath: null })
      )

      videoRepo.updateFilePathPrefix('/old/root', '/new/root')

      const v = videoRepo.findById('v-null')!
      expect(v.filePath).toBe('/new/root/test.mp4')
      expect(v.thumbnailPath).toBeNull()
    })

    it('only replaces the leading prefix when oldPrefix appears mid-path', () => {
      creatorRepo.upsert(makeCreator())
      videoRepo.upsert(
        makeVideo({
          id: 'v-collide',
          filePath: '/old/root/creator-1/old/root-thing/video.mp4',
          thumbnailPath: '/old/root/creator-1/old/root-thing/thumb.jpg'
        })
      )

      videoRepo.updateFilePathPrefix('/old/root', '/new/root')

      const v = videoRepo.findById('v-collide')!
      // Only the leading "/old/root" is rewritten; the second occurrence stays.
      expect(v.filePath).toBe('/new/root/creator-1/old/root-thing/video.mp4')
      expect(v.thumbnailPath).toBe('/new/root/creator-1/old/root-thing/thumb.jpg')
    })

    it('leaves rows whose filePath does not start with oldPrefix untouched', () => {
      creatorRepo.upsert(makeCreator())
      videoRepo.upsert(
        makeVideo({
          id: 'v-match',
          filePath: '/old/root/creator-1/downloads/v-match/video.mp4',
          thumbnailPath: '/old/root/creator-1/downloads/v-match/thumb.jpg'
        })
      )
      videoRepo.upsert(
        makeVideo({
          id: 'v-other',
          filePath: '/some/other/path/video.mp4',
          thumbnailPath: '/some/other/path/thumb.jpg'
        })
      )

      videoRepo.updateFilePathPrefix('/old/root', '/new/root')

      const matched = videoRepo.findById('v-match')!
      expect(matched.filePath).toBe('/new/root/creator-1/downloads/v-match/video.mp4')
      expect(matched.thumbnailPath).toBe('/new/root/creator-1/downloads/v-match/thumb.jpg')

      const other = videoRepo.findById('v-other')!
      expect(other.filePath).toBe('/some/other/path/video.mp4')
      expect(other.thumbnailPath).toBe('/some/other/path/thumb.jpg')
    })

    it('treats LIKE wildcards (% and _) in oldPrefix as literal characters', () => {
      // Without escaping, "_" is a single-char wildcard and would let
      // /some-dir/root match a /some_dir/root prefix. Confirm only the
      // intended row is rewritten.
      creatorRepo.upsert(makeCreator())
      videoRepo.upsert(
        makeVideo({
          id: 'v-target',
          filePath: '/some_dir/root/creator-1/downloads/v-target/video.mp4',
          thumbnailPath: '/some_dir/root/creator-1/downloads/v-target/thumb.jpg'
        })
      )
      videoRepo.upsert(
        makeVideo({
          id: 'v-decoy',
          filePath: '/some-dir/root/creator-1/downloads/v-decoy/video.mp4',
          thumbnailPath: null
        })
      )

      videoRepo.updateFilePathPrefix('/some_dir/root', '/new/root')

      const target = videoRepo.findById('v-target')!
      expect(target.filePath).toBe('/new/root/creator-1/downloads/v-target/video.mp4')
      expect(target.thumbnailPath).toBe('/new/root/creator-1/downloads/v-target/thumb.jpg')

      // Decoy untouched — % wildcard would have matched without escaping.
      const decoy = videoRepo.findById('v-decoy')!
      expect(decoy.filePath).toBe('/some-dir/root/creator-1/downloads/v-decoy/video.mp4')
    })
  })

  // ── findByTags ──

  describe('findByTags', () => {
    it('returns an empty array when called with no tags', () => {
      videoRepo.upsert(makeVideo({ tags: ['music'] }))
      expect(videoRepo.findByTags([])).toEqual([])
    })

    it('returns active videos that match any of the requested tags (OR semantics)', () => {
      videoRepo.upsert(makeVideo({ id: 'v-1', tags: ['music', 'live'] }))
      videoRepo.upsert(makeVideo({ id: 'v-2', tags: ['vlog'] }))
      videoRepo.upsert(makeVideo({ id: 'v-3', tags: ['live', 'concert'] }))
      videoRepo.upsert(makeVideo({ id: 'v-4', tags: [] }))

      const results = videoRepo.findByTags(['live'])
      expect(results.map((v) => v.id).sort()).toEqual(['v-1', 'v-3'])
    })

    it('does not return deleted or missing videos even when their tag matches', () => {
      videoRepo.upsert(makeVideo({ id: 'active', tags: ['music'] }))
      videoRepo.upsert(makeVideo({ id: 'deleted', tags: ['music'], status: 'deleted' }))
      videoRepo.upsert(makeVideo({ id: 'missing', tags: ['music'], status: 'missing' }))

      const results = videoRepo.findByTags(['music'])
      expect(results.map((v) => v.id)).toEqual(['active'])
    })

    it('deduplicates rows even when multiple requested tags match the same video', () => {
      videoRepo.upsert(makeVideo({ id: 'v-1', tags: ['music', 'live', 'concert'] }))
      const results = videoRepo.findByTags(['music', 'live'])
      expect(results).toHaveLength(1)
    })
  })

  // ── getAllDistinctTags ──

  describe('getAllDistinctTags', () => {
    it('returns an empty array when no active videos have tags', () => {
      videoRepo.upsert(makeVideo({ tags: [] }))
      expect(videoRepo.getAllDistinctTags()).toEqual([])
    })

    it('aggregates per-tag counts across active videos', () => {
      videoRepo.upsert(makeVideo({ id: 'v-1', tags: ['music', 'live'] }))
      videoRepo.upsert(makeVideo({ id: 'v-2', tags: ['music'] }))
      videoRepo.upsert(makeVideo({ id: 'v-3', tags: ['live', 'concert'] }))

      const tags = videoRepo.getAllDistinctTags()
      const byTag = Object.fromEntries(tags.map((t) => [t.tag, t.count]))
      expect(byTag).toEqual({ music: 2, live: 2, concert: 1 })
    })

    it('orders by count desc then tag asc', () => {
      videoRepo.upsert(makeVideo({ id: 'v-1', tags: ['music', 'live', 'concert'] }))
      videoRepo.upsert(makeVideo({ id: 'v-2', tags: ['music'] }))

      const tags = videoRepo.getAllDistinctTags()
      // music=2, then concert/live tied at 1 (alpha: concert, live)
      expect(tags.map((t) => t.tag)).toEqual(['music', 'concert', 'live'])
    })

    it('excludes tags carried only by non-active videos', () => {
      videoRepo.upsert(makeVideo({ id: 'active', tags: ['music'] }))
      videoRepo.upsert(makeVideo({ id: 'deleted', tags: ['gone'], status: 'deleted' }))

      const tags = videoRepo.getAllDistinctTags()
      expect(tags.map((t) => t.tag)).toEqual(['music'])
    })
  })

  // ── searchByTitle ──

  describe('searchByTitle', () => {
    it('returns an empty array for an empty / whitespace-only query', () => {
      videoRepo.upsert(makeVideo({ id: 'v-1', title: 'Anything' }))
      expect(videoRepo.searchByTitle('', 10)).toEqual([])
      expect(videoRepo.searchByTitle('   ', 10)).toEqual([])
    })

    it('returns an empty array when limit ≤ 0', () => {
      videoRepo.upsert(makeVideo({ id: 'v-1', title: 'foo' }))
      expect(videoRepo.searchByTitle('foo', 0)).toEqual([])
      expect(videoRepo.searchByTitle('foo', -3)).toEqual([])
    })

    it('matches case-insensitive substrings of the title', () => {
      videoRepo.upsert(makeVideo({ id: 'v-1', title: 'Funny Cat Compilation' }))
      videoRepo.upsert(makeVideo({ id: 'v-2', title: 'Cat-tastic vlog' }))
      videoRepo.upsert(makeVideo({ id: 'v-3', title: 'Dog highlights' }))

      const results = videoRepo.searchByTitle('CAT', 10)
      expect(results.map((v) => v.id).sort()).toEqual(['v-1', 'v-2'])
    })

    it('caps results to the supplied limit', () => {
      videoRepo.upsert(makeVideo({ id: 'v-1', title: 'foo one' }))
      videoRepo.upsert(makeVideo({ id: 'v-2', title: 'foo two' }))
      videoRepo.upsert(makeVideo({ id: 'v-3', title: 'foo three' }))

      const results = videoRepo.searchByTitle('foo', 2)
      expect(results).toHaveLength(2)
    })

    it('skips deleted and missing videos', () => {
      videoRepo.upsert(makeVideo({ id: 'active', title: 'foo active' }))
      videoRepo.upsert(makeVideo({ id: 'gone', title: 'foo gone', status: 'deleted' }))
      videoRepo.upsert(makeVideo({ id: 'missing', title: 'foo missing', status: 'missing' }))

      const results = videoRepo.searchByTitle('foo', 10)
      expect(results.map((v) => v.id)).toEqual(['active'])
    })

    it('treats LIKE wildcards in the query as literals (escapes %, _, \\)', () => {
      videoRepo.upsert(makeVideo({ id: 'v-1', title: '50% off party' }))
      videoRepo.upsert(makeVideo({ id: 'v-2', title: 'underscore_it' }))
      videoRepo.upsert(makeVideo({ id: 'v-3', title: 'plain title' }))

      // '%' should match literal % in v-1 only — not act as a wildcard.
      expect(videoRepo.searchByTitle('%', 10).map((v) => v.id)).toEqual(['v-1'])
      // '_' matches the literal underscore in v-2 only.
      expect(videoRepo.searchByTitle('_', 10).map((v) => v.id)).toEqual(['v-2'])
    })
  })
})
