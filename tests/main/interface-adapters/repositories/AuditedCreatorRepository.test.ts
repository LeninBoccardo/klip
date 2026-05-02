import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  SqliteCreatorRepository,
  SqliteVideoRepository,
  SqliteCutRepository,
  SqliteAuditLogRepository,
  AuditedCreatorRepository
} from '@main/interface-adapters/repositories'
import type { Creator, Video, Cut } from '@domain/entities'
import type { DatabaseInstance } from '@main/framework-drivers/database'
import { SqliteTransactionScope } from '@main/framework-drivers/database'
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
    title: 'Vid',
    url: null,
    duration: null,
    resolution: null,
    fileSize: null,
    filePath: '/root/creator-1/downloads/v-1/video.mp4',
    thumbnailPath: null,
    downloadDate: null,
    probeStatus: 'pending',
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
    createdAt: '2025-01-02T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
    ...overrides
  }
}

function makeCut(overrides: Partial<Cut> = {}): Cut {
  return {
    id: 'c-1',
    creatorId: 'creator-1',
    videoId: null,
    title: 'Cut',
    tags: [],
    startTimestamp: null,
    endTimestamp: null,
    duration: null,
    resolution: null,
    fileSize: null,
    filePath: '/root/creator-1/cuts/c-1/cut.mp4',
    thumbnailPath: null,
    probeStatus: 'pending',
    status: 'active',
    deletedAt: null,
    createdAt: '2025-01-03T00:00:00.000Z',
    updatedAt: '2025-01-03T00:00:00.000Z',
    ...overrides
  }
}

describe('AuditedCreatorRepository', () => {
  let database: DatabaseInstance
  let innerRepo: SqliteCreatorRepository
  let videoRepo: SqliteVideoRepository
  let cutRepo: SqliteCutRepository
  let auditLogRepo: SqliteAuditLogRepository
  let repo: AuditedCreatorRepository

  beforeEach(() => {
    database = createTestDb()
    innerRepo = new SqliteCreatorRepository(database.db)
    videoRepo = new SqliteVideoRepository(database.db)
    cutRepo = new SqliteCutRepository(database.db)
    auditLogRepo = new SqliteAuditLogRepository(database.db)
    const transactionScope = new SqliteTransactionScope(database.raw)
    repo = new AuditedCreatorRepository(
      innerRepo,
      auditLogRepo,
      transactionScope,
      videoRepo,
      cutRepo
    )
  })

  afterEach(() => {
    database.raw.close()
  })

  // ── Read delegation ──

  it('delegates findAll to inner repo', () => {
    repo.upsert(makeCreator())
    const all = repo.findAll()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe('creator-1')
  })

  it('delegates findById to inner repo', () => {
    repo.upsert(makeCreator())
    expect(repo.findById('creator-1')).not.toBeNull()
    expect(repo.findById('ghost')).toBeNull()
  })

  it('delegates findAllActive to inner repo', () => {
    repo.upsert(makeCreator({ id: 'c1', folderName: 'c1', status: 'active' }))
    repo.upsert(makeCreator({ id: 'c2', folderName: 'c2', status: 'missing' }))
    expect(repo.findAllActive()).toHaveLength(1)
  })

  it('delegates findByFolderName to inner repo', () => {
    repo.upsert(makeCreator())
    expect(repo.findByFolderName('creator-1')).not.toBeNull()
    expect(repo.findByFolderName('nope')).toBeNull()
  })

  it('delegates findPaginated to inner repo', () => {
    repo.upsert(makeCreator())
    const result = repo.findPaginated({ page: 1, pageSize: 10 })
    expect(result.total).toBe(1)
  })

  // ── upsert: create ──

  it('logs "created" action when inserting a new entity', () => {
    repo.upsert(makeCreator())

    const logs = auditLogRepo.findByEntity('creator', 'creator-1')
    expect(logs).toHaveLength(1)
    expect(logs[0].action).toBe('created')
    expect(logs[0].changes).toBeNull()
  })

  // ── upsert: update with changes ──

  it('logs "updated" action with diff when entity changes', () => {
    repo.upsert(makeCreator({ name: 'Original' }))
    repo.upsert(makeCreator({ name: 'Updated', updatedAt: '2025-02-01T00:00:00.000Z' }))

    const logs = auditLogRepo.findByEntity('creator', 'creator-1')
    expect(logs).toHaveLength(2)

    const updateLog = logs.find((l) => l.action === 'updated')
    expect(updateLog).toBeDefined()

    const changes = JSON.parse(updateLog!.changes!)
    expect(changes.name).toEqual({ old: 'Original', new: 'Updated' })
  })

  // ── upsert: no actual changes ──

  it('does NOT log "updated" when upsert has identical data', () => {
    const creator = makeCreator()
    repo.upsert(creator)
    repo.upsert(creator) // same data, same updatedAt

    const logs = auditLogRepo.findByEntity('creator', 'creator-1')
    // Only the initial "created" entry, no "updated"
    expect(logs).toHaveLength(1)
    expect(logs[0].action).toBe('created')
  })

  // ── updateStatus ──

  it('logs "status_changed" action with old/new status', () => {
    repo.upsert(makeCreator({ status: 'active' }))
    repo.updateStatus('creator-1', 'missing', null)

    const logs = auditLogRepo.findByEntity('creator', 'creator-1')
    const statusLog = logs.find((l) => l.action === 'status_changed')
    expect(statusLog).toBeDefined()

    const changes = JSON.parse(statusLog!.changes!)
    expect(changes.status).toEqual({ old: 'active', new: 'missing' })
    expect(changes.deletedAt).toEqual({ old: null, new: null })
  })

  it('logs deletedAt change when marking as deleted', () => {
    repo.upsert(makeCreator())
    repo.updateStatus('creator-1', 'deleted', '2025-06-01T00:00:00.000Z')

    const logs = auditLogRepo.findByEntity('creator', 'creator-1')
    const statusLog = logs.find((l) => l.action === 'status_changed')
    const changes = JSON.parse(statusLog!.changes!)
    expect(changes.status).toEqual({ old: 'active', new: 'deleted' })
    expect(changes.deletedAt).toEqual({ old: null, new: '2025-06-01T00:00:00.000Z' })
  })

  it('logs status_changed even when entity is not found (old values are null)', () => {
    // Edge: updateStatus on non-existent ID — inner repo does nothing but audit logs attempt
    repo.updateStatus('ghost', 'active', null)

    const logs = auditLogRepo.findByEntity('creator', 'ghost')
    expect(logs).toHaveLength(1)
    expect(logs[0].action).toBe('status_changed')
    const changes = JSON.parse(logs[0].changes!)
    expect(changes.status.old).toBeNull()
  })

  // ── delete ──

  it('logs "deleted" action', () => {
    repo.upsert(makeCreator())
    repo.delete('creator-1')

    const logs = auditLogRepo.findByEntity('creator', 'creator-1')
    const deleteLog = logs.find((l) => l.action === 'deleted')
    expect(deleteLog).toBeDefined()
    expect(deleteLog!.changes).toBeNull()
  })

  it('entity is removed after delete', () => {
    repo.upsert(makeCreator())
    repo.delete('creator-1')
    expect(repo.findById('creator-1')).toBeNull()
  })

  it('emits cascade_deleted audit entries for every video and cut wiped by FK CASCADE', () => {
    repo.upsert(makeCreator())
    videoRepo.upsert(makeVideo({ id: 'v-1' }))
    videoRepo.upsert(makeVideo({ id: 'v-2' }))
    cutRepo.upsert(makeCut({ id: 'c-1' }))

    repo.delete('creator-1')

    // FK CASCADE wiped the rows.
    expect(videoRepo.findById('v-1')).toBeNull()
    expect(videoRepo.findById('v-2')).toBeNull()
    expect(cutRepo.findById('c-1')).toBeNull()

    // One cascade_deleted entry per victim, with the trigger context.
    const v1Logs = auditLogRepo.findByEntity('video', 'v-1')
    const v1Cascade = v1Logs.find((l) => l.action === 'cascade_deleted')
    expect(v1Cascade).toBeDefined()
    expect(JSON.parse(v1Cascade!.changes!)).toEqual({
      cascadedFrom: { entityType: 'creator', entityId: 'creator-1' }
    })

    const v2Cascade = auditLogRepo
      .findByEntity('video', 'v-2')
      .find((l) => l.action === 'cascade_deleted')
    expect(v2Cascade).toBeDefined()

    const c1Cascade = auditLogRepo
      .findByEntity('cut', 'c-1')
      .find((l) => l.action === 'cascade_deleted')
    expect(c1Cascade).toBeDefined()
  })

  it('does not emit cascade_deleted entries when the creator has no children', () => {
    repo.upsert(makeCreator())
    repo.delete('creator-1')

    // Plain creator delete still produces one creator-level entry, no cascade ones.
    const cascadeLogs = auditLogRepo.findRecent(100).filter((l) => l.action === 'cascade_deleted')
    expect(cascadeLogs).toHaveLength(0)
  })
})
