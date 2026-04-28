import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MigrateRootFolder } from '@use-cases/MigrateRootFolder'
import {
  SqliteCreatorRepository,
  SqliteVideoRepository,
  SqliteCutRepository,
  SqliteSettingsRepository,
  SqliteOperationRepository,
  SqliteAuditLogRepository,
  AuditedVideoRepository,
  AuditedCutRepository
} from '@main/interface-adapters/repositories'
import { NodePathResolver } from '@main/interface-adapters/file-system/NodePathResolver'
import { NodeIdGenerator } from '@main/interface-adapters/crypto/NodeIdGenerator'
import type { Creator, Video, Cut } from '@domain/entities'
import type {
  IFileSystemReader,
  IFileSystemWriter,
  IFileWatcher,
  INotifier,
  RootPathRef
} from '@domain/ports'
import type { IReconcileDirectory } from '@use-cases/IReconcileDirectory'
import type { ProcessFileNotifications } from '@use-cases/ProcessFileNotifications'
import { SqliteTransactionScope, type DatabaseInstance } from '@main/framework-drivers/database'
import { createTestDb } from '../helpers/createTestDb'

// ── factories ──

function makeCreator(overrides: Partial<Creator> = {}): Creator {
  return {
    id: 'creator-a',
    folderName: 'creator-a',
    name: 'Creator A',
    profileImagePath: null,
    youtubeChannelId: null,
    youtubeChannelUrl: null,
    subscriberCount: null,
    avatarUrl: null,
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
    creatorId: 'creator-a',
    title: 'Test Video',
    url: null,
    duration: 120,
    resolution: '1920x1080',
    fileSize: 50_000_000,
    filePath: '/old/root/creator-a/downloads/video-1/video.mp4',
    thumbnailPath: '/old/root/creator-a/downloads/video-1/thumb.jpg',
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
    createdAt: '2025-01-02T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
    ...overrides
  }
}

function makeCut(overrides: Partial<Cut> = {}): Cut {
  return {
    id: 'cut-1',
    creatorId: 'creator-a',
    videoId: 'video-1',
    title: 'Test Cut',
    tags: [],
    startTimestamp: 0,
    endTimestamp: 30,
    duration: 30,
    resolution: '1920x1080',
    fileSize: 10_000_000,
    filePath: '/old/root/creator-a/cuts/cut-1/cut.mp4',
    thumbnailPath: null,
    probeStatus: 'complete',
    status: 'active',
    deletedAt: null,
    createdAt: '2025-01-03T00:00:00.000Z',
    updatedAt: '2025-01-03T00:00:00.000Z',
    ...overrides
  }
}

describe('MigrateRootFolder (integration)', () => {
  let database: DatabaseInstance
  let creatorRepo: SqliteCreatorRepository
  let rawVideoRepo: SqliteVideoRepository
  let rawCutRepo: SqliteCutRepository
  let videoRepo: AuditedVideoRepository
  let cutRepo: AuditedCutRepository
  let settingsRepo: SqliteSettingsRepository
  let operationRepo: SqliteOperationRepository
  let auditLogRepo: SqliteAuditLogRepository
  let rootPathRef: RootPathRef
  let useCase: MigrateRootFolder

  // ── mocks (only for OS / external surfaces) ──
  let fsReader: IFileSystemReader
  let fsWriter: IFileSystemWriter
  let fileWatcher: IFileWatcher
  let processNotifications: ProcessFileNotifications
  let reconcile: IReconcileDirectory
  let notifier: INotifier

  beforeEach(() => {
    database = createTestDb()
    creatorRepo = new SqliteCreatorRepository(database.db)
    rawVideoRepo = new SqliteVideoRepository(database.db)
    rawCutRepo = new SqliteCutRepository(database.db)
    settingsRepo = new SqliteSettingsRepository(database.db)
    operationRepo = new SqliteOperationRepository(database.db)
    auditLogRepo = new SqliteAuditLogRepository(database.db)
    const transactionScope = new SqliteTransactionScope(database.raw)
    videoRepo = new AuditedVideoRepository(rawVideoRepo, auditLogRepo, transactionScope)
    cutRepo = new AuditedCutRepository(rawCutRepo, auditLogRepo, transactionScope)
    rootPathRef = { value: '/old/root' }

    fsReader = {
      directoryExists: vi.fn().mockReturnValue(true),
      fileExists: vi.fn().mockReturnValue(false),
      listDirectories: vi.fn().mockReturnValue(['creator-a']),
      listFiles: vi.fn().mockReturnValue([]),
      readJsonFile: vi.fn().mockReturnValue(null),
      readTextFile: vi.fn().mockReturnValue(null)
    }
    fsWriter = {
      ensureDirectory: vi.fn(),
      writeFile: vi.fn(),
      renameDirectory: vi.fn(),
      moveDirectory: vi.fn(),
      isDirectoryEmpty: vi.fn().mockReturnValue(true)
    }
    fileWatcher = {
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
      restart: vi.fn().mockResolvedValue(undefined),
      onEvent: vi.fn()
    }
    processNotifications = {
      suspend: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
      handleEvent: vi.fn()
    } as unknown as ProcessFileNotifications
    reconcile = {
      execute: vi.fn().mockReturnValue({
        creatorsAdded: 0,
        creatorsMarkedMissing: 0,
        creatorsRecovered: 0,
        videosAdded: 0,
        videosMarkedMissing: 0,
        videosRecovered: 0,
        cutsAdded: 0,
        cutsMarkedMissing: 0,
        cutsRecovered: 0
      }),
      executeForCreator: vi.fn()
    }
    notifier = { notify: vi.fn() }

    useCase = new MigrateRootFolder(
      operationRepo,
      settingsRepo,
      videoRepo,
      cutRepo,
      fsReader,
      fsWriter,
      new NodePathResolver(),
      fileWatcher,
      processNotifications,
      reconcile,
      new NodeIdGenerator(),
      notifier,
      rootPathRef,
      new SqliteTransactionScope(database.raw)
    )
  })

  afterEach(() => {
    database.raw.close()
  })

  it('rewrites video/cut paths, settings, and rootPathRef in a single migration', async () => {
    // Arrange: settings + DB rows. One row per repo matches the prefix; one does not.
    settingsRepo.set('rootPath', '/old/root')
    creatorRepo.upsert(makeCreator())
    videoRepo.upsert(makeVideo({ id: 'v-match' }))
    videoRepo.upsert(
      makeVideo({
        id: 'v-other',
        filePath: '/elsewhere/root/video.mp4',
        thumbnailPath: '/elsewhere/root/thumb.jpg'
      })
    )
    cutRepo.upsert(makeCut({ id: 'c-match', videoId: null }))
    cutRepo.upsert(
      makeCut({
        id: 'c-other',
        videoId: null,
        filePath: '/elsewhere/root/cut.mp4'
      })
    )

    // Act
    const result = await useCase.execute('/new/root')

    // Assert: orchestration result
    expect(result.success).toBe(true)
    expect(result.movedCount).toBe(1)

    // Settings persisted to the new root, and the shared mutable ref is in sync.
    expect(settingsRepo.get('rootPath')).toBe('/new/root')
    expect(rootPathRef.value).toBe('/new/root')

    // Real Drizzle UPDATE rewrote matching rows on both tables.
    const matchedVideo = videoRepo.findById('v-match')!
    expect(matchedVideo.filePath).toBe('/new/root/creator-a/downloads/video-1/video.mp4')
    expect(matchedVideo.thumbnailPath).toBe('/new/root/creator-a/downloads/video-1/thumb.jpg')

    const matchedCut = cutRepo.findById('c-match')!
    expect(matchedCut.filePath).toBe('/new/root/creator-a/cuts/cut-1/cut.mp4')
    expect(matchedCut.thumbnailPath).toBeNull()

    // Non-matching rows untouched on both tables.
    expect(videoRepo.findById('v-other')!.filePath).toBe('/elsewhere/root/video.mp4')
    expect(videoRepo.findById('v-other')!.thumbnailPath).toBe('/elsewhere/root/thumb.jpg')
    expect(cutRepo.findById('c-other')!.filePath).toBe('/elsewhere/root/cut.mp4')

    // Operation log records a completed migrate_root.
    const completed = operationRepo.findByStatus('completed')
    expect(completed).toHaveLength(1)
    expect(completed[0].type).toBe('migrate_root')

    // Watcher lifecycle: stopped before move, restarted on the new root after.
    expect(fileWatcher.stop).toHaveBeenCalledTimes(1)
    expect(fileWatcher.restart).toHaveBeenCalledWith('/new/root')
    expect(processNotifications.suspend).toHaveBeenCalledTimes(1)
    expect(processNotifications.resume).toHaveBeenCalledTimes(1)
    expect(reconcile.execute).toHaveBeenCalledWith('/new/root')
  })
})
