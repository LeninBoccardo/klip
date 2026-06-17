import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  SqliteCreatorRepository,
  SqliteVideoRepository,
  SqliteCutRepository,
  SqliteAuditLogRepository,
  AuditedCutRepository
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
    probeStatus: 'complete',
    status: 'active',
    deletedAt: null,
    editRecipeJson: null,
    createdAt: '2025-01-03T00:00:00.000Z',
    updatedAt: '2025-01-03T00:00:00.000Z',
    ...overrides
  }
}

describe('AuditedCutRepository', () => {
  let database: DatabaseInstance
  let creatorRepo: SqliteCreatorRepository
  let videoRepo: SqliteVideoRepository
  let innerRepo: SqliteCutRepository
  let auditLogRepo: SqliteAuditLogRepository
  let repo: AuditedCutRepository

  beforeEach(() => {
    database = createTestDb()
    creatorRepo = new SqliteCreatorRepository(database.db)
    videoRepo = new SqliteVideoRepository(database.db)
    innerRepo = new SqliteCutRepository(database.db)
    auditLogRepo = new SqliteAuditLogRepository(database.db)
    const transactionScope = new SqliteTransactionScope(database.raw)
    repo = new AuditedCutRepository(innerRepo, auditLogRepo, transactionScope)

    creatorRepo.upsert(makeCreator())
    videoRepo.upsert(makeVideo())
  })

  afterEach(() => {
    database.raw.close()
  })

  // ── Read delegation ──

  it('delegates findAll to inner repo', () => {
    repo.upsert(makeCut())
    expect(repo.findAll()).toHaveLength(1)
  })

  it('delegates findById to inner repo', () => {
    repo.upsert(makeCut())
    expect(repo.findById('cut-1')).not.toBeNull()
    expect(repo.findById('ghost')).toBeNull()
  })

  it('delegates findByCreatorId to inner repo', () => {
    repo.upsert(makeCut())
    expect(repo.findByCreatorId('creator-1')).toHaveLength(1)
  })

  it('delegates findByVideoId to inner repo', () => {
    repo.upsert(makeCut())
    expect(repo.findByVideoId('video-1')).toHaveLength(1)
  })

  it('delegates findByTags to inner repo', () => {
    repo.upsert(makeCut())
    expect(repo.findByTags(['funny'])).toHaveLength(1)
    expect(repo.findByTags(['nonexistent'])).toHaveLength(0)
  })

  it('delegates findAllActive to inner repo', () => {
    repo.upsert(makeCut({ id: 'c-1', status: 'active' }))
    repo.upsert(makeCut({ id: 'c-2', status: 'missing' }))
    expect(repo.findAllActive()).toHaveLength(1)
  })

  it('delegates findPaginated to inner repo', () => {
    repo.upsert(makeCut())
    const result = repo.findPaginated({ page: 1, pageSize: 10 })
    expect(result.total).toBe(1)
  })

  // ── upsert: create ──

  it('logs "created" action for new cut', () => {
    repo.upsert(makeCut())

    const logs = auditLogRepo.findByEntity('cut', 'cut-1')
    expect(logs).toHaveLength(1)
    expect(logs[0].action).toBe('created')
    expect(logs[0].changes).toBeNull()
  })

  // ── upsert: update with changes ──

  it('logs "updated" action with diff when cut changes', () => {
    repo.upsert(makeCut({ title: 'Original' }))
    repo.upsert(makeCut({ title: 'Updated', updatedAt: '2025-03-01T00:00:00.000Z' }))

    const logs = auditLogRepo.findByEntity('cut', 'cut-1')
    expect(logs).toHaveLength(2)
    expect(logs[0].action).toBe('updated')

    const changes = JSON.parse(logs[0].changes!)
    expect(changes.title).toEqual({ old: 'Original', new: 'Updated' })
  })

  it('detects tag changes in diff', () => {
    repo.upsert(makeCut({ tags: ['a', 'b'] }))
    repo.upsert(makeCut({ tags: ['a', 'c'], updatedAt: '2025-03-01T00:00:00.000Z' }))

    const logs = auditLogRepo.findByEntity('cut', 'cut-1')
    const updateLog = logs.find((l) => l.action === 'updated')
    expect(updateLog).toBeDefined()

    const changes = JSON.parse(updateLog!.changes!)
    expect(changes.tags).toBeDefined()
  })

  // ── upsert: no actual changes ──

  it('does NOT log "updated" when data is identical', () => {
    const cut = makeCut()
    repo.upsert(cut)
    repo.upsert(cut)

    const logs = auditLogRepo.findByEntity('cut', 'cut-1')
    expect(logs).toHaveLength(1)
    expect(logs[0].action).toBe('created')
  })

  // ── updateStatus ──

  it('logs "status_changed" with old/new values', () => {
    repo.upsert(makeCut())
    repo.updateStatus('cut-1', 'deleted', '2025-06-01T00:00:00.000Z')

    const logs = auditLogRepo.findByEntity('cut', 'cut-1')
    const statusLog = logs.find((l) => l.action === 'status_changed')
    expect(statusLog).toBeDefined()

    const changes = JSON.parse(statusLog!.changes!)
    expect(changes.status).toEqual({ old: 'active', new: 'deleted' })
    expect(changes.deletedAt).toEqual({ old: null, new: '2025-06-01T00:00:00.000Z' })
  })

  // ── updateProbeResult ──

  it('logs "probe_status_changed" for updateProbeResult', () => {
    repo.upsert(makeCut({ probeStatus: 'pending' }))
    repo.updateProbeResult('cut-1', {
      duration: 30,
      resolution: '1280x720',
      fileSize: 1_000_000,
      probeStatus: 'complete'
    })

    const logs = auditLogRepo.findByEntity('cut', 'cut-1')
    const probeLog = logs.find((l) => l.action === 'probe_status_changed')
    expect(probeLog).toBeDefined()
    const changes = JSON.parse(probeLog!.changes!)
    expect(changes.probeStatus).toEqual({ old: 'pending', new: 'complete' })
    expect(repo.findById('cut-1')?.duration).toBe(30)
  })

  // ── delete ──

  it('logs "deleted" action', () => {
    repo.upsert(makeCut())
    repo.delete('cut-1')

    const logs = auditLogRepo.findByEntity('cut', 'cut-1')
    const deleteLog = logs.find((l) => l.action === 'deleted')
    expect(deleteLog).toBeDefined()
    expect(deleteLog!.changes).toBeNull()
  })

  it('entity is removed after delete', () => {
    repo.upsert(makeCut())
    repo.delete('cut-1')
    expect(repo.findById('cut-1')).toBeNull()
  })
})
