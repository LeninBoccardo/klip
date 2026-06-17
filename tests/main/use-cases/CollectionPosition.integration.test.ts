import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  SqliteCollectionRepository,
  SqliteCreatorRepository,
  SqliteVideoRepository,
  SqliteCutRepository
} from '@main/interface-adapters/repositories'
import { SqliteTransactionScope } from '@main/framework-drivers/database'
import type { DatabaseInstance } from '@main/framework-drivers/database'
import type { Creator, Video, Cut } from '@domain/entities'
import { AddToCollection } from '@use-cases/AddToCollection'
import { RemoveFromCollection } from '@use-cases/RemoveFromCollection'
import { ReorderCollection } from '@use-cases/ReorderCollection'
import { createTestDb } from '../helpers/createTestDb'

/**
 * F94 — the "position is unique within a collection across collection_videos
 * UNION collection_cuts" invariant has no DB constraint (SQLite can't express a
 * cross-table UNIQUE); it's enforced purely by AddToCollection (max+1) and
 * ReorderCollection (two-phase densify). This integration test drives the real
 * repository + use cases through a mixed add/remove/reorder sequence spanning
 * both kinds and asserts positions never collide — guarding the invariant the
 * schema comment documents and the AUDIT-2026-05-02 note deliberately leaves to
 * the application layer.
 */

function makeCreator(): Creator {
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
    updatedAt: '2025-01-01T00:00:00.000Z'
  }
}

function makeVideo(id: string): Video {
  return {
    id,
    creatorId: 'creator-1',
    title: id,
    url: null,
    duration: null,
    resolution: null,
    fileSize: null,
    frameRate: null,
    filePath: `/x/${id}.mp4`,
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
    transcriptText: null,
    detailFetchedAt: null,
    status: 'active',
    deletedAt: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z'
  }
}

function makeCut(id: string): Cut {
  return {
    id,
    creatorId: 'creator-1',
    videoId: null,
    title: id,
    tags: [],
    startTimestamp: null,
    endTimestamp: null,
    duration: null,
    resolution: null,
    fileSize: null,
    filePath: `/x/${id}.mp4`,
    thumbnailPath: null,
    probeStatus: 'complete',
    status: 'active',
    deletedAt: null,
    editRecipeJson: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z'
  }
}

describe('Collection position invariant (F94)', () => {
  let database: DatabaseInstance
  let collectionRepo: SqliteCollectionRepository
  let add: AddToCollection
  let remove: RemoveFromCollection
  let reorder: ReorderCollection

  const COL = 'col-1'
  const notifier = { notify: vi.fn() }

  /** Positions must be distinct across the UNION of videos + cuts. */
  const assertCollisionFree = (): number[] => {
    const positions = collectionRepo.getItems(COL).map((i) => i.position)
    expect(new Set(positions).size).toBe(positions.length)
    return positions
  }

  beforeEach(() => {
    database = createTestDb()
    const creatorRepo = new SqliteCreatorRepository(database.db)
    const videoRepo = new SqliteVideoRepository(database.db)
    const cutRepo = new SqliteCutRepository(database.db)
    collectionRepo = new SqliteCollectionRepository(database.db)
    const transaction = new SqliteTransactionScope(database.raw)

    creatorRepo.upsert(makeCreator())
    for (const id of ['v-1', 'v-2', 'v-3']) videoRepo.upsert(makeVideo(id))
    for (const id of ['c-1', 'c-2']) cutRepo.upsert(makeCut(id))
    collectionRepo.upsert({
      id: COL,
      name: 'Mixed',
      description: null,
      kind: 'manual',
      smartQuery: null,
      createdAt: '2025-02-01T00:00:00.000Z',
      updatedAt: '2025-02-01T00:00:00.000Z'
    })

    add = new AddToCollection(collectionRepo, videoRepo, cutRepo, transaction, notifier)
    remove = new RemoveFromCollection(collectionRepo, notifier)
    reorder = new ReorderCollection(collectionRepo, transaction, notifier)
  })

  afterEach(() => {
    database.raw.close()
  })

  it('keeps positions collision-free across a mixed add/remove/reorder sequence', () => {
    // Interleave videos and cuts so a per-table-only scheme would collide.
    add.execute({ collectionId: COL, kind: 'video', id: 'v-1' })
    add.execute({ collectionId: COL, kind: 'cut', id: 'c-1' })
    add.execute({ collectionId: COL, kind: 'video', id: 'v-2' })
    expect(assertCollisionFree()).toEqual([0, 1, 2])

    // Remove from the middle of the range — leaves a sparse-but-unique set.
    remove.execute({ collectionId: COL, kind: 'video', id: 'v-1' })
    let positions = assertCollisionFree()
    expect(positions).toEqual([1, 2])

    // Adding after a removal must anchor to max+1, not reuse the freed slot 0.
    add.execute({ collectionId: COL, kind: 'cut', id: 'c-2' })
    add.execute({ collectionId: COL, kind: 'video', id: 'v-3' })
    positions = assertCollisionFree()
    expect(positions).toEqual([1, 2, 3, 4])

    // A reorder densifies back to a contiguous 0..n-1, still collision-free.
    reorder.execute({
      collectionId: COL,
      items: [
        { kind: 'video', id: 'v-3' },
        { kind: 'cut', id: 'c-1' },
        { kind: 'video', id: 'v-2' },
        { kind: 'cut', id: 'c-2' }
      ]
    })
    expect(assertCollisionFree()).toEqual([0, 1, 2, 3])
    // And the densified order matches the requested order.
    expect(collectionRepo.getItems(COL).map((i) => `${i.kind}:${i.id}`)).toEqual([
      'video:v-3',
      'cut:c-1',
      'video:v-2',
      'cut:c-2'
    ])
  })

  it('re-adding an existing item is idempotent and does not duplicate its position', () => {
    add.execute({ collectionId: COL, kind: 'video', id: 'v-1' })
    add.execute({ collectionId: COL, kind: 'cut', id: 'c-1' })
    // Re-add v-1: returns its existing position, no new row, no collision.
    const result = add.execute({ collectionId: COL, kind: 'video', id: 'v-1' })
    expect(result.position).toBe(0)
    expect(collectionRepo.getItems(COL)).toHaveLength(2)
    expect(assertCollisionFree()).toEqual([0, 1])
  })
})
