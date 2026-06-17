import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  SqliteCreatorRepository,
  SqliteVideoRepository,
  SqliteAuditLogRepository,
  AuditedVideoRepository
} from '@main/interface-adapters/repositories'
import type { Creator, Video } from '@domain/entities'
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
    url: 'https://youtube.com/watch?v=abc',
    duration: 120,
    resolution: '1920x1080',
    fileSize: 50_000_000,
    frameRate: null,
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
    detailFetchedAt: null,
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
    const transactionScope = new SqliteTransactionScope(database.raw)
    repo = new AuditedVideoRepository(innerRepo, auditLogRepo, transactionScope)

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

  // ── updateProbeResult ──

  it('does NOT audit updateProbeResult — pure ffprobe enrichment is silent (F10)', () => {
    repo.upsert(makeVideo())
    const before = auditLogRepo.findByEntity('video', 'video-1').length

    repo.updateProbeResult('video-1', {
      duration: 120,
      resolution: '1920x1080',
      fileSize: 5_000_000,
      probeStatus: 'complete'
    })

    const after = auditLogRepo.findByEntity('video', 'video-1')
    // No new audit row — matches the ENRICHMENT_ONLY_FIELDS suppression on the
    // upsert path, so the activity feed isn't peppered after every download.
    expect(after.length).toBe(before)
    expect(after.some((l) => l.action === 'probe_status_changed')).toBe(false)
    // The write still landed.
    expect(repo.findById('video-1')?.probeStatus).toBe('complete')
  })

  // ── updateDetail ──

  it('DOES audit updateDetail as "updated" — detail is user-meaningful, not enrichment (F21)', () => {
    repo.upsert(makeVideo())
    const before = auditLogRepo.findByEntity('video', 'video-1').length

    repo.updateDetail('video-1', {
      viewCount: 5000,
      likeCount: 100,
      dislikeCount: null,
      commentCount: 25,
      category: 'Music',
      tags: ['rock'],
      uploadDate: '2024-03-15',
      description: 'A song',
      isShort: false,
      transcriptPath: null,
      transcriptText: null,
      detailFetchedAt: '2025-02-01T00:00:00.000Z'
    })

    const logs = auditLogRepo.findByEntity('video', 'video-1')
    // Unlike updateProbeResult, the detail columns are NOT in
    // ENRICHMENT_ONLY_FIELDS, so a real change produces one "updated" entry —
    // matching the behavior of the full-row upsert this replaced.
    expect(logs.length).toBe(before + 1)
    const updateLog = logs.find((l) => l.action === 'updated')
    expect(updateLog).toBeDefined()
    const changes = JSON.parse(updateLog!.changes!)
    expect(changes.likeCount).toEqual({ old: null, new: 100 })
    expect(changes.tags).toEqual({ old: [], new: ['rock'] })
    // The write landed.
    expect(repo.findById('video-1')?.likeCount).toBe(100)
  })

  it('does NOT audit updateDetail when nothing actually changed (F21)', () => {
    // Seed the row already carrying the detail values, then re-write the same
    // ones: the diff is empty (updatedAt is filtered) so no "updated" entry.
    repo.upsert(
      makeVideo({
        viewCount: 5000,
        likeCount: 100,
        dislikeCount: null,
        commentCount: 25,
        category: 'Music',
        tags: ['rock'],
        uploadDate: '2024-03-15',
        description: 'A song',
        isShort: false,
        transcriptPath: null,
        detailFetchedAt: '2025-02-01T00:00:00.000Z'
      })
    )
    const before = auditLogRepo.findByEntity('video', 'video-1').length

    repo.updateDetail('video-1', {
      viewCount: 5000,
      likeCount: 100,
      dislikeCount: null,
      commentCount: 25,
      category: 'Music',
      tags: ['rock'],
      uploadDate: '2024-03-15',
      description: 'A song',
      isShort: false,
      transcriptPath: null,
      transcriptText: null,
      detailFetchedAt: '2025-02-01T00:00:00.000Z'
    })

    expect(auditLogRepo.findByEntity('video', 'video-1').length).toBe(before)
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
