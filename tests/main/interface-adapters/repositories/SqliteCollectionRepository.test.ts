import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  SqliteCollectionRepository,
  SqliteCreatorRepository,
  SqliteVideoRepository,
  SqliteCutRepository
} from '@main/interface-adapters/repositories'
import type { Collection, Creator, Video, Cut } from '@domain/entities'
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
    id: 'v-1',
    creatorId: 'creator-1',
    title: 'Test Video',
    url: null,
    duration: null,
    resolution: null,
    fileSize: null,
    filePath: '/x/v.mp4',
    thumbnailPath: null,
    downloadDate: null,
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
    detailFetchedAt: null,
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
    videoId: null,
    title: 'Test Cut',
    tags: [],
    startTimestamp: null,
    endTimestamp: null,
    duration: null,
    resolution: null,
    fileSize: null,
    filePath: '/x/c.mp4',
    thumbnailPath: null,
    probeStatus: 'complete',
    status: 'active',
    deletedAt: null,
    editRecipeJson: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides
  }
}

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

describe('SqliteCollectionRepository', () => {
  let database: DatabaseInstance
  let repo: SqliteCollectionRepository
  let videoRepo: SqliteVideoRepository
  let cutRepo: SqliteCutRepository

  beforeEach(() => {
    database = createTestDb()
    new SqliteCreatorRepository(database.db).upsert(makeCreator())
    videoRepo = new SqliteVideoRepository(database.db)
    cutRepo = new SqliteCutRepository(database.db)
    repo = new SqliteCollectionRepository(database.db)
  })

  afterEach(() => {
    database.raw.close()
  })

  describe('CRUD', () => {
    it('upsert + findById + findAll round-trip', () => {
      repo.upsert(makeCollection({ id: 'a', name: 'A' }))
      repo.upsert(makeCollection({ id: 'b', name: 'B' }))

      expect(repo.findById('a')?.name).toBe('A')
      expect(repo.findAll()).toHaveLength(2)
    })

    it('upsert overwrites on conflict (same id)', () => {
      repo.upsert(makeCollection({ id: 'a', name: 'Original' }))
      repo.upsert(
        makeCollection({ id: 'a', name: 'Updated', updatedAt: '2025-02-02T00:00:00.000Z' })
      )

      expect(repo.findById('a')?.name).toBe('Updated')
      expect(repo.findAll()).toHaveLength(1)
    })

    it('delete cascades to join rows in both collection_videos and collection_cuts', () => {
      videoRepo.upsert(makeVideo({ id: 'v-1' }))
      cutRepo.upsert(makeCut({ id: 'cut-1' }))
      repo.upsert(makeCollection({ id: 'col' }))
      repo.addVideo('col', 'v-1', 0, '2025-02-01T00:00:00.000Z')
      repo.addCut('col', 'cut-1', 1, '2025-02-01T00:00:00.000Z')

      expect(repo.getItems('col')).toHaveLength(2)
      repo.delete('col')
      expect(repo.findById('col')).toBeNull()
      expect(repo.getItems('col')).toEqual([])
    })

    it('countItemsByCollection batches member counts (video + cut) per collection (F44)', () => {
      videoRepo.upsert(makeVideo({ id: 'v-1' }))
      videoRepo.upsert(makeVideo({ id: 'v-2' }))
      cutRepo.upsert(makeCut({ id: 'cut-1' }))
      repo.upsert(makeCollection({ id: 'col-a' }))
      repo.upsert(makeCollection({ id: 'col-b' }))
      repo.upsert(makeCollection({ id: 'col-empty' }))
      repo.addVideo('col-a', 'v-1', 0, '2025-02-01T00:00:00.000Z')
      repo.addVideo('col-a', 'v-2', 1, '2025-02-01T00:00:00.000Z')
      repo.addCut('col-a', 'cut-1', 2, '2025-02-01T00:00:00.000Z')
      repo.addVideo('col-b', 'v-1', 0, '2025-02-01T00:00:00.000Z')

      const counts = repo.countItemsByCollection(['col-a', 'col-b', 'col-empty'])
      expect(counts.get('col-a')).toBe(3) // 2 videos + 1 cut
      expect(counts.get('col-b')).toBe(1)
      expect(counts.get('col-empty')).toBeUndefined() // no rows → absent
      expect(repo.countItemsByCollection([]).size).toBe(0)
    })

    it('findPaginated supports search by name and orders by updatedAt desc by default', () => {
      repo.upsert(makeCollection({ id: 'a', name: 'Alpha', updatedAt: '2025-02-01T00:00:00.000Z' }))
      repo.upsert(makeCollection({ id: 'b', name: 'Beta', updatedAt: '2025-02-03T00:00:00.000Z' }))
      repo.upsert(
        makeCollection({ id: 'c', name: 'Charlie', updatedAt: '2025-02-02T00:00:00.000Z' })
      )

      const all = repo.findPaginated({ page: 1, pageSize: 10 })
      expect(all.data.map((c) => c.id)).toEqual(['b', 'c', 'a'])

      const filtered = repo.findPaginated({ page: 1, pageSize: 10, search: 'alp' })
      expect(filtered.data.map((c) => c.id)).toEqual(['a'])
      expect(filtered.total).toBe(1)
    })
  })

  describe('item ordering (getItems)', () => {
    beforeEach(() => {
      videoRepo.upsert(makeVideo({ id: 'v-1' }))
      videoRepo.upsert(makeVideo({ id: 'v-2' }))
      cutRepo.upsert(makeCut({ id: 'cut-1' }))
      cutRepo.upsert(makeCut({ id: 'cut-2' }))
      repo.upsert(makeCollection({ id: 'col' }))
    })

    it('returns interleaved video+cut items sorted by position', () => {
      repo.addVideo('col', 'v-1', 0, '2025-02-01T00:00:00.000Z')
      repo.addCut('col', 'cut-1', 1, '2025-02-01T00:00:00.000Z')
      repo.addVideo('col', 'v-2', 2, '2025-02-01T00:00:00.000Z')
      repo.addCut('col', 'cut-2', 3, '2025-02-01T00:00:00.000Z')

      const items = repo.getItems('col')
      expect(items.map((i) => `${i.kind}:${i.id}`)).toEqual([
        'video:v-1',
        'cut:cut-1',
        'video:v-2',
        'cut:cut-2'
      ])
    })

    it('returns an empty array for an unknown collection id', () => {
      expect(repo.getItems('does-not-exist')).toEqual([])
    })

    it('removeVideo / removeCut leave other items intact and ordering stable', () => {
      repo.addVideo('col', 'v-1', 0, '2025-02-01T00:00:00.000Z')
      repo.addCut('col', 'cut-1', 1, '2025-02-01T00:00:00.000Z')
      repo.addVideo('col', 'v-2', 2, '2025-02-01T00:00:00.000Z')

      repo.removeCut('col', 'cut-1')
      const items = repo.getItems('col')
      expect(items.map((i) => `${i.kind}:${i.id}`)).toEqual(['video:v-1', 'video:v-2'])
    })
  })

  describe('reorderItems', () => {
    beforeEach(() => {
      videoRepo.upsert(makeVideo({ id: 'v-1' }))
      videoRepo.upsert(makeVideo({ id: 'v-2' }))
      cutRepo.upsert(makeCut({ id: 'cut-1' }))
      repo.upsert(makeCollection({ id: 'col' }))
      repo.addVideo('col', 'v-1', 0, '2025-02-01T00:00:00.000Z')
      repo.addCut('col', 'cut-1', 1, '2025-02-01T00:00:00.000Z')
      repo.addVideo('col', 'v-2', 2, '2025-02-01T00:00:00.000Z')
    })

    it('renumbers items to dense 0..n-1 in the supplied order', () => {
      repo.reorderItems('col', [
        { kind: 'video', id: 'v-2', position: 0, addedAt: '' },
        { kind: 'video', id: 'v-1', position: 1, addedAt: '' },
        { kind: 'cut', id: 'cut-1', position: 2, addedAt: '' }
      ])

      const items = repo.getItems('col')
      expect(items.map((i) => `${i.kind}:${i.id}`)).toEqual(['video:v-2', 'video:v-1', 'cut:cut-1'])
      expect(items.map((i) => i.position)).toEqual([0, 1, 2])
    })

    it('preserves the unified-position invariant after a swap (no duplicate positions)', () => {
      repo.reorderItems('col', [
        { kind: 'cut', id: 'cut-1', position: 0, addedAt: '' },
        { kind: 'video', id: 'v-1', position: 1, addedAt: '' },
        { kind: 'video', id: 'v-2', position: 2, addedAt: '' }
      ])

      const items = repo.getItems('col')
      const positions = items.map((i) => i.position)
      const unique = new Set(positions)
      expect(unique.size).toBe(positions.length)
    })
  })
})
