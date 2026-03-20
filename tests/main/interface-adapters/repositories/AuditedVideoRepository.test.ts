import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  SqliteCreatorRepository,
  SqliteVideoRepository,
  SqliteAuditLogRepository,
  AuditedVideoRepository
} from '@main/interface-adapters/repositories'
import type { Creator, Video } from '@domain/entities'
import type { DatabaseInstance } from '@main/framework-drivers/database'
import { createTestDb } from '../../helpers/createTestDb'

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

describe('AuditedVideoRepository', () => {
  let database: DatabaseInstance
  let creatorRepo: SqliteCreatorRepository
  let innerRepo: SqliteVideoRepository
  let auditLogRepo: SqliteAuditLogRepository
  let repo: AuditedVideoRepository

  beforeEach(() => {
    database = createTestDb()
    creatorRepo = new SqliteCreatorRepository(database.db)
    innerRepo = new SqliteVideoRepository(database.db)
    auditLogRepo = new SqliteAuditLogRepository(database.db)
    repo = new AuditedVideoRepository(innerRepo, auditLogRepo)

    creatorRepo.upsert(makeCreator())
  })

  afterEach(() => {
    database.raw.close()
  })

  // ── Read delegation ──

  it('delegates findAll to inner repo', () => {
    repo.upsert(makeVideo())
    expect(repo.findAll()).toHaveLength(1)
  })

  it('delegates findById to inner repo', () => {
    repo.upsert(makeVideo())
    expect(repo.findById('video-1')).not.toBeNull()
    expect(repo.findById('ghost')).toBeNull()
  })

  it('delegates findByCreatorId to inner repo', () => {
    repo.upsert(makeVideo())
    expect(repo.findByCreatorId('creator-1')).toHaveLength(1)
    expect(repo.findByCreatorId('other')).toHaveLength(0)
  })

  it('delegates findAllActive to inner repo', () => {
    repo.upsert(makeVideo({ id: 'v-1', status: 'active' }))
    repo.upsert(makeVideo({ id: 'v-2', status: 'missing' }))
    expect(repo.findAllActive()).toHaveLength(1)
  })

  it('delegates findPaginated to inner repo', () => {
    repo.upsert(makeVideo())
    const result = repo.findPaginated({ page: 1, pageSize: 10 })
    expect(result.total).toBe(1)
  })

  // ── upsert: create ──

  it('logs "created" action for new video', () => {
    repo.upsert(makeVideo())

    const logs = auditLogRepo.findByEntity('video', 'video-1')
    expect(logs).toHaveLength(1)
    expect(logs[0].action).toBe('created')
    expect(logs[0].changes).toBeNull()
  })

  // ── upsert: update with changes ──

  it('logs "updated" action with diff when video changes', () => {
    repo.upsert(makeVideo({ title: 'Original' }))
    repo.upsert(makeVideo({ title: 'Updated', updatedAt: '2025-03-01T00:00:00.000Z' }))

    const logs = auditLogRepo.findByEntity('video', 'video-1')
    expect(logs).toHaveLength(2)

    const updateLog = logs.find((l) => l.action === 'updated')
    expect(updateLog).toBeDefined()

    const changes = JSON.parse(updateLog!.changes!)
    expect(changes.title).toEqual({ old: 'Original', new: 'Updated' })
  })

  // ── upsert: no actual changes ──

  it('does NOT log "updated" when data is identical', () => {
    const video = makeVideo()
    repo.upsert(video)
    repo.upsert(video)

    const logs = auditLogRepo.findByEntity('video', 'video-1')
    expect(logs).toHaveLength(1)
    expect(logs[0].action).toBe('created')
  })

  // ── updateStatus ──

  it('logs "status_changed" with old/new values', () => {
    repo.upsert(makeVideo())
    repo.updateStatus('video-1', 'missing', null)

    const logs = auditLogRepo.findByEntity('video', 'video-1')
    const statusLog = logs.find((l) => l.action === 'status_changed')
    expect(statusLog).toBeDefined()

    const changes = JSON.parse(statusLog!.changes!)
    expect(changes.status).toEqual({ old: 'active', new: 'missing' })
  })

  // ── delete ──

  it('logs "deleted" action', () => {
    repo.upsert(makeVideo())
    repo.delete('video-1')

    const logs = auditLogRepo.findByEntity('video', 'video-1')
    const deleteLog = logs.find((l) => l.action === 'deleted')
    expect(deleteLog).toBeDefined()
    expect(deleteLog!.changes).toBeNull()
  })

  it('entity is removed after delete', () => {
    repo.upsert(makeVideo())
    repo.delete('video-1')
    expect(repo.findById('video-1')).toBeNull()
  })
})


