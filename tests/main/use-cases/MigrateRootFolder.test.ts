import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MigrateRootFolder } from '@use-cases/MigrateRootFolder'
import type {
  IOperationRepository,
  ISettingsRepository,
  IVideoRepository,
  ICutRepository
} from '@domain/repositories'
import type {
  IFileSystemReader,
  IFileSystemWriter,
  IPathResolver,
  IFileWatcher,
  INotifier,
  IIdGenerator,
  ITransactionScope
} from '@domain/ports'
import type { ProcessFileNotifications } from '@use-cases/ProcessFileNotifications'
import type { IReconcileDirectory } from '@use-cases/IReconcileDirectory'
import { join } from 'path'

function createMocks() {
  const operationRepo: IOperationRepository = {
    create: vi.fn(),
    findById: vi.fn(),
    findByStatus: vi.fn(),
    updateStatus: vi.fn(),
    updatePayload: vi.fn()
  }
  const settingsRepo: ISettingsRepository = {
    get: vi.fn().mockReturnValue('/old/root'),
    set: vi.fn(),
    getAll: vi.fn().mockReturnValue({})
  }
  const videoRepo: IVideoRepository = {
    findAll: vi.fn(),
    findAllActive: vi.fn(),
    findById: vi.fn(),
    findByCreatorId: vi.fn(),
    findByProbeStatus: vi.fn(),
    upsert: vi.fn(),
    updateStatus: vi.fn(),
    updateProbeStatus: vi.fn(),
    delete: vi.fn(),
    findPaginated: vi.fn(),
    updateFilePathPrefix: vi.fn()
  }
  const cutRepo: ICutRepository = {
    findAll: vi.fn(),
    findAllActive: vi.fn(),
    findById: vi.fn(),
    findByCreatorId: vi.fn(),
    findByVideoId: vi.fn(),
    findByTags: vi.fn(),
    findByProbeStatus: vi.fn(),
    upsert: vi.fn(),
    updateStatus: vi.fn(),
    updateProbeStatus: vi.fn(),
    delete: vi.fn(),
    findPaginated: vi.fn(),
    updateFilePathPrefix: vi.fn()
  }
  const fsReader: IFileSystemReader = {
    directoryExists: vi.fn().mockReturnValue(true),
    fileExists: vi.fn(),
    listDirectories: vi.fn().mockReturnValue(['creator-a', 'creator-b', 'creator-c']),
    listFiles: vi.fn().mockReturnValue([]),
    readJsonFile: vi.fn(),
    readTextFile: vi.fn()
  }
  const fsWriter: IFileSystemWriter = {
    ensureDirectory: vi.fn(),
    writeFile: vi.fn(),
    renameDirectory: vi.fn(),
    moveDirectory: vi.fn(),
    isDirectoryEmpty: vi.fn().mockReturnValue(true)
  }
  const pathResolver: IPathResolver = {
    join: vi.fn((...segments: string[]) => join(...segments)),
    dirname: vi.fn((p: string) => p.split('/').slice(0, -1).join('/') || '/')
  }
  const fileWatcher: IFileWatcher = {
    start: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn().mockResolvedValue(undefined),
    onEvent: vi.fn()
  }
  const processNotifications = {
    suspend: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    handleEvent: vi.fn()
  } as unknown as ProcessFileNotifications
  const reconcile: IReconcileDirectory = {
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
    })
  }
  const idGenerator: IIdGenerator = {
    generate: vi.fn().mockReturnValue('op-123')
  }
  const notifier: INotifier = {
    notify: vi.fn()
  }

  return {
    operationRepo,
    settingsRepo,
    videoRepo,
    cutRepo,
    fsReader,
    fsWriter,
    pathResolver,
    fileWatcher,
    processNotifications,
    reconcile,
    idGenerator,
    notifier,
    rootPathRef: { value: '/old/root' },
    transaction: { run: vi.fn(<T>(fn: () => T) => fn()) } as ITransactionScope
  }
}

function createUseCase(mocks: ReturnType<typeof createMocks>) {
  return new MigrateRootFolder(
    mocks.operationRepo,
    mocks.settingsRepo,
    mocks.videoRepo,
    mocks.cutRepo,
    mocks.fsReader,
    mocks.fsWriter,
    mocks.pathResolver,
    mocks.fileWatcher,
    mocks.processNotifications,
    mocks.reconcile,
    mocks.idGenerator,
    mocks.notifier,
    mocks.rootPathRef,
    mocks.transaction
  )
}

describe('MigrateRootFolder', () => {
  let mocks: ReturnType<typeof createMocks>
  let useCase: MigrateRootFolder

  beforeEach(() => {
    mocks = createMocks()
    useCase = createUseCase(mocks)
  })

  // ── Validation ──

  it('returns error when no root path is configured', async () => {
    vi.mocked(mocks.settingsRepo.get).mockReturnValue(null)
    const result = await useCase.execute('/new/root')
    expect(result.success).toBe(false)
    expect(result.error).toContain('No current root path')
  })

  it('returns error when new root is same as current', async () => {
    const result = await useCase.execute('/old/root')
    expect(result.success).toBe(false)
    expect(result.error).toContain('same as the current root')
  })

  it('returns error when current root does not exist', async () => {
    vi.mocked(mocks.fsReader.directoryExists).mockReturnValue(false)
    const result = await useCase.execute('/new/root')
    expect(result.success).toBe(false)
    expect(result.error).toContain('does not exist')
  })

  it('returns error when target directory is not empty', async () => {
    vi.mocked(mocks.fsWriter.isDirectoryEmpty).mockReturnValue(false)
    const result = await useCase.execute('/new/root')
    expect(result.success).toBe(false)
    expect(result.error).toContain('not empty')
  })

  it('auto-creates target directory if it does not exist', async () => {
    vi.mocked(mocks.fsReader.directoryExists).mockImplementation((p) => p === '/old/root')
    vi.mocked(mocks.fsReader.listDirectories).mockReturnValue([])

    await useCase.execute('/new/root')

    expect(mocks.fsWriter.ensureDirectory).toHaveBeenCalledWith('/new/root')
  })

  // ── Happy path ──

  it('moves all folders, updates DB, and reconciles', async () => {
    const result = await useCase.execute('/new/root')

    expect(result.success).toBe(true)
    expect(result.movedCount).toBe(3)

    // Suspend/stop
    expect(mocks.processNotifications.suspend).toHaveBeenCalled()
    expect(mocks.fileWatcher.stop).toHaveBeenCalled()

    // Folders moved
    expect(mocks.fsWriter.moveDirectory).toHaveBeenCalledTimes(3)

    // DB paths updated
    expect(mocks.videoRepo.updateFilePathPrefix).toHaveBeenCalledWith('/old/root', '/new/root')
    expect(mocks.cutRepo.updateFilePathPrefix).toHaveBeenCalledWith('/old/root', '/new/root')

    // Settings updated
    expect(mocks.settingsRepo.set).toHaveBeenCalledWith('rootPath', '/new/root')

    // Operation lifecycle: created with status='in_progress' + startedAt,
    // then transitioned to 'completed' on success.
    expect(mocks.operationRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'op-123',
        status: 'in_progress',
        startedAt: expect.any(String)
      })
    )
    expect(mocks.operationRepo.updateStatus).toHaveBeenCalledWith('op-123', 'completed')

    // Watcher restarted on new root
    expect(mocks.fileWatcher.restart).toHaveBeenCalledWith('/new/root')
    expect(mocks.processNotifications.resume).toHaveBeenCalled()

    // Reconcile triggered
    expect(mocks.reconcile.execute).toHaveBeenCalledWith('/new/root')
  })

  it('pushes progress events in the expected phase sequence (moving×3 → updating_db → reconciling)', async () => {
    await useCase.execute('/new/root')

    const calls = vi.mocked(mocks.notifier.notify).mock.calls
    const progressCalls = calls.filter(([ch]) => ch === 'migrate-root-progress')

    // The whole sequence is asserted — `length === 5` plus a single
    // `[0].phase === 'moving'` would pass even if events 1+2 were reordered
    // or duplicated. The blocking-operation dialog drives its progress bar
    // off the current count, so moving=1/3 → moving=3/3 must be monotonic.
    const phases = progressCalls.map(([, payload]) => (payload as { phase: string }).phase)
    expect(phases).toEqual(['moving', 'moving', 'moving', 'updating_db', 'reconciling'])

    expect(progressCalls[0][1]).toMatchObject({ phase: 'moving', current: 1, total: 3 })
    expect(progressCalls[1][1]).toMatchObject({ phase: 'moving', current: 2, total: 3 })
    expect(progressCalls[2][1]).toMatchObject({ phase: 'moving', current: 3, total: 3 })
    expect(progressCalls[3][1]).toMatchObject({ phase: 'updating_db' })
    expect(progressCalls[4][1]).toMatchObject({ phase: 'reconciling' })
  })

  it('updates operation payload after each folder move (v2 schema with per-folder status)', async () => {
    await useCase.execute('/new/root')

    expect(mocks.operationRepo.updatePayload).toHaveBeenCalledTimes(3)
    // After third call, moves should record all 3 with status 'moved'
    const lastPayload = JSON.parse(vi.mocked(mocks.operationRepo.updatePayload).mock.calls[2][1])
    expect(lastPayload.version).toBe(2)
    expect(lastPayload.moves).toEqual([
      { folder: 'creator-a', status: 'moved' },
      { folder: 'creator-b', status: 'moved' },
      { folder: 'creator-c', status: 'moved' }
    ])
  })

  // ── Rollback on failure ──

  it('rolls back moved folders when a move fails mid-way', async () => {
    let callCount = 0
    vi.mocked(mocks.fsWriter.moveDirectory).mockImplementation(() => {
      callCount++
      if (callCount === 2) throw new Error('Disk full')
    })

    const result = await useCase.execute('/new/root')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Disk full')
    expect(result.movedCount).toBe(1) // only creator-a was successfully moved

    // Rollback: move creator-a back
    // moveDirectory calls: 1 (creator-a ok) + 1 (creator-b fail) + 1 (rollback creator-a)
    expect(mocks.fsWriter.moveDirectory).toHaveBeenCalledTimes(3)

    // Operation marked failed
    expect(mocks.operationRepo.updateStatus).toHaveBeenCalledWith('op-123', 'failed', 'Disk full')

    // Watcher restarted on OLD root
    expect(mocks.fileWatcher.restart).toHaveBeenCalledWith('/old/root')
    expect(mocks.processNotifications.resume).toHaveBeenCalled()
  })

  // ── DB failure after all folders moved ──

  it('rolls folders back to the old root when the DB update fails (F11)', async () => {
    vi.mocked(mocks.videoRepo.updateFilePathPrefix).mockImplementation(() => {
      throw new Error('DB locked')
    })

    const result = await useCase.execute('/new/root')

    expect(result.success).toBe(false)
    expect(result.movedCount).toBe(3)
    expect(result.error).toContain('DB update failed')

    // F11: the path-rewrite transaction is atomic, so the DB is back at oldRoot.
    // The folders must be moved back to match — not stranded at newRoot under a
    // terminal 'failed' op. 3 forward moves + 3 rollback moves.
    expect(mocks.fsWriter.moveDirectory).toHaveBeenCalledTimes(6)
    expect(mocks.operationRepo.updateStatus).toHaveBeenCalledWith('op-123', 'failed', 'DB locked')
    // Watcher restarted on the OLD root (where the files now live again).
    expect(mocks.fileWatcher.restart).toHaveBeenCalledWith('/old/root')
    expect(mocks.fileWatcher.restart).not.toHaveBeenCalledWith('/new/root')
  })

  it('marks payload partial=true and persists per-folder status when a rollback step fails', async () => {
    let moveCalls = 0
    vi.mocked(mocks.fsWriter.moveDirectory).mockImplementation(() => {
      moveCalls++
      // Forward moves: 1 (creator-a) + 2 (creator-b) → throw to trigger rollback.
      if (moveCalls === 2) throw new Error('Disk full')
      // Call 3 is the rollback move of creator-a — make it fail so the rollback
      // itself is partial and payload.partial must be set to true.
      if (moveCalls === 3) throw new Error('rollback failed')
    })

    const result = await useCase.execute('/new/root')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Disk full')
    expect(result.movedCount).toBe(1)

    // Final persist must mark partial=true and keep creator-a at status='moved'
    // (failed to roll back) so RecoverOperations can resume on next startup.
    const calls = vi.mocked(mocks.operationRepo.updatePayload).mock.calls
    const finalPayload = JSON.parse(calls[calls.length - 1][1])
    expect(finalPayload.partial).toBe(true)
    expect(finalPayload.moves).toEqual([{ folder: 'creator-a', status: 'moved' }])
  })

  it('persists per-folder rollback success (status flips to rolled-back)', async () => {
    let moveCalls = 0
    vi.mocked(mocks.fsWriter.moveDirectory).mockImplementation(() => {
      moveCalls++
      if (moveCalls === 2) throw new Error('Disk full')
      // All other calls succeed (forward and rollback)
    })

    await useCase.execute('/new/root')

    const calls = vi.mocked(mocks.operationRepo.updatePayload).mock.calls
    const finalPayload = JSON.parse(calls[calls.length - 1][1])
    // creator-a forward-moved then successfully rolled back
    expect(finalPayload.moves).toEqual([{ folder: 'creator-a', status: 'rolled-back' }])
    expect(finalPayload.partial).toBeUndefined()
  })

  // ── Zero folders ──

  it('succeeds with zero folders to move', async () => {
    vi.mocked(mocks.fsReader.listDirectories).mockReturnValue([])

    const result = await useCase.execute('/new/root')

    expect(result.success).toBe(true)
    expect(result.movedCount).toBe(0)
    expect(mocks.fsWriter.moveDirectory).not.toHaveBeenCalled()
  })
})
