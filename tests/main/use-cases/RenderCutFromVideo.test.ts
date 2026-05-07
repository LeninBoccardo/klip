import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RenderCutFromVideo } from '@use-cases/RenderCutFromVideo'
import type {
  ICreatorRepository,
  ICutRepository,
  IOperationRepository,
  IVideoRepository
} from '@domain/repositories'
import type {
  IRenderBackend,
  IRenderQueue,
  IEditorSessionStore,
  IFileSystemReader,
  IFileSystemWriter,
  IPathResolver,
  IIdGenerator,
  INotifier,
  RootPathRef
} from '@domain/ports'
import type { Creator, Video } from '@domain/entities'
import type { EditRecipe, RenderCutRequest } from '@shared/types'

// ── Minimal mock builders for the orchestrator ──

function mockBackend(canRenderResult?: { ok: true } | { ok: false; reason: string }): IRenderBackend {
  return {
    canRender: vi.fn().mockReturnValue(canRenderResult ?? { ok: true }),
    render: vi.fn().mockResolvedValue({ durationMs: 0 })
  }
}

function mockQueue(): IRenderQueue {
  return {
    enqueue: vi.fn().mockResolvedValue(undefined),
    size: vi.fn().mockReturnValue(0),
    pending: vi.fn().mockReturnValue(0),
    clear: vi.fn()
  }
}

function mockSessions(overrides: Partial<IEditorSessionStore> = {}): IEditorSessionStore {
  return {
    open: vi.fn(),
    get: vi.fn().mockReturnValue(null),
    getAbortController: vi.fn().mockReturnValue(null),
    update: vi.fn(),
    finalize: vi.fn(),
    list: vi.fn().mockReturnValue([]),
    remove: vi.fn(),
    ...overrides
  }
}

function mockCutRepo(overrides: Partial<ICutRepository> = {}): ICutRepository {
  return {
    findAll: vi.fn(),
    findAllActive: vi.fn(),
    findById: vi.fn(),
    findByCreatorId: vi.fn(),
    findIdsByCreator: vi.fn(),
    findByVideoId: vi.fn(),
    findByProbeStatus: vi.fn(),
    getAllDistinctTags: vi.fn(),
    findByTags: vi.fn(),
    searchByTitle: vi.fn(),
    upsert: vi.fn(),
    upsertWithPrevious: vi.fn(),
    updateStatus: vi.fn(),
    updateProbeStatus: vi.fn(),
    delete: vi.fn(),
    updateFilePathPrefix: vi.fn(),
    findPaginated: vi.fn(),
    count: vi.fn(),
    sumDuration: vi.fn(),
    sumFileSize: vi.fn(),
    ...overrides
  } as ICutRepository
}

function mockCreatorRepo(creator: Creator | null): ICreatorRepository {
  return {
    findById: vi.fn().mockReturnValue(creator)
  } as unknown as ICreatorRepository
}

function mockVideoRepo(video: Video | null): IVideoRepository {
  return {
    findById: vi.fn().mockReturnValue(video)
  } as unknown as IVideoRepository
}

function mockOpRepo(overrides: Partial<IOperationRepository> = {}): IOperationRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockReturnValue(null),
    findByStatus: vi.fn().mockReturnValue([]),
    updateStatus: vi.fn(),
    updatePayload: vi.fn(),
    ...overrides
  }
}

function mockFsReader(): IFileSystemReader {
  return {
    directoryExists: vi.fn().mockReturnValue(true),
    fileExists: vi.fn().mockReturnValue(true),
    listDirectories: vi.fn().mockReturnValue([]),
    listFiles: vi.fn().mockReturnValue([]),
    readJsonFile: vi.fn().mockReturnValue(null),
    readTextFile: vi.fn().mockReturnValue(null)
  }
}

function mockFsWriter(): IFileSystemWriter {
  return {
    ensureDirectory: vi.fn(),
    writeFile: vi.fn(),
    renameDirectory: vi.fn(),
    moveDirectory: vi.fn(),
    deleteFile: vi.fn(),
    isDirectoryEmpty: vi.fn().mockReturnValue(true)
  }
}

function mockPath(): IPathResolver {
  return {
    join: vi.fn((...parts: string[]) => parts.join('/')),
    dirname: vi.fn((p: string) => p.split('/').slice(0, -1).join('/'))
  }
}

function mockIds(...ids: string[]): IIdGenerator {
  let i = 0
  return {
    generate: vi.fn(() => ids[i++ % ids.length])
  }
}

function mockNotifier(): INotifier {
  return { notify: vi.fn() } as unknown as INotifier
}

const ROOT: RootPathRef = { value: '/library' }

const SAMPLE_VIDEO: Video = {
  id: 'vid-1',
  creatorId: 'creator-1',
  filePath: '/library/c/downloads/vid-1/vid-1.mp4',
  url: 'https://x',
  title: 'src',
  duration: 30,
  resolution: null,
  fileSize: null,
  thumbnailPath: null,
  uploadDate: null,
  description: null,
  probeStatus: 'ok',
  status: 'active',
  deletedAt: null,
  transcriptText: null,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z'
} as unknown as Video

const SAMPLE_CREATOR: Creator = {
  id: 'creator-1',
  folderName: 'creator',
  name: 'Creator',
  channelUrl: null,
  status: 'active',
  deletedAt: null,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z'
} as unknown as Creator

function trimRequest(): RenderCutRequest {
  const recipe: EditRecipe = {
    version: 1,
    sourceVideoId: 'vid-1',
    ops: [{ type: 'trim', in: 1, out: 5 }],
    output: { container: 'mp4', mode: 'copy' }
  }
  return { recipe, title: 'My Cut', tags: ['a'] }
}

function build(opts: {
  backends?: IRenderBackend[]
  cutRepo?: ICutRepository
  sessions?: IEditorSessionStore
  opRepo?: IOperationRepository
  videoRepo?: IVideoRepository
  creatorRepo?: ICreatorRepository
}): {
  useCase: RenderCutFromVideo
  cutRepo: ICutRepository
  sessions: IEditorSessionStore
  opRepo: IOperationRepository
} {
  const cutRepo = opts.cutRepo ?? mockCutRepo()
  const sessions = opts.sessions ?? mockSessions()
  const opRepo = opts.opRepo ?? mockOpRepo()
  const useCase = new RenderCutFromVideo(
    opts.backends ?? [mockBackend()],
    mockQueue(),
    sessions,
    cutRepo,
    opts.creatorRepo ?? mockCreatorRepo(SAMPLE_CREATOR),
    opts.videoRepo ?? mockVideoRepo(SAMPLE_VIDEO),
    opRepo,
    mockFsReader(),
    mockFsWriter(),
    mockPath(),
    mockIds('cut-1', 'job-1'),
    mockNotifier(),
    ROOT
  )
  return { useCase, cutRepo, sessions, opRepo }
}

// ── Tests ──

describe('RenderCutFromVideo.pickBackend — HP-10 reason propagation', () => {
  it('throws with the joined per-backend reasons when no backend matches', async () => {
    const b1 = mockBackend({ ok: false, reason: 'reason-A' })
    const b2 = mockBackend({ ok: false, reason: 'reason-B' })
    const { useCase } = build({ backends: [b1, b2] })

    await expect(useCase.execute(trimRequest())).rejects.toThrow(/reason-A.*reason-B/)
  })

  it('returns the first matching backend (does not exhaust the list)', async () => {
    const matching = mockBackend({ ok: true })
    const second = mockBackend({ ok: true })
    const { useCase } = build({ backends: [matching, second] })

    await useCase.execute(trimRequest())

    expect(matching.canRender).toHaveBeenCalledTimes(1)
    expect(second.canRender).not.toHaveBeenCalled()
  })
})

describe('RenderCutFromVideo.execute — HP-6 prelude rollback on throw', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rolls back the operation row when sessions.open throws', async () => {
    const cutRepo = mockCutRepo()
    const opRepo = mockOpRepo()
    const sessions = mockSessions({
      open: vi.fn().mockImplementation(() => {
        throw new Error('session collision')
      })
    })
    const { useCase } = build({ cutRepo, sessions, opRepo })

    await expect(useCase.execute(trimRequest())).rejects.toThrow('session collision')

    // Operation row was created → must be marked failed in the catch.
    expect(opRepo.create).toHaveBeenCalledTimes(1)
    expect(opRepo.updateStatus).toHaveBeenCalledWith(
      'job-1',
      'failed',
      expect.stringContaining('session collision')
    )
    // Cut row was created → must be deleted before re-throw.
    expect(cutRepo.upsertWithPrevious).toHaveBeenCalledTimes(1)
    expect(cutRepo.delete).toHaveBeenCalledWith('cut-1')
    // Session was never opened, so remove must NOT be called.
    expect(sessions.remove).not.toHaveBeenCalled()
  })

  it('rolls back the operation row when cutRepo.upsertWithPrevious throws', async () => {
    const cutRepo = mockCutRepo({
      upsertWithPrevious: vi.fn().mockImplementation(() => {
        throw new Error('cut upsert failed')
      })
    })
    const opRepo = mockOpRepo()
    const sessions = mockSessions()
    const { useCase } = build({ cutRepo, sessions, opRepo })

    await expect(useCase.execute(trimRequest())).rejects.toThrow('cut upsert failed')

    expect(opRepo.create).toHaveBeenCalledTimes(1)
    expect(opRepo.updateStatus).toHaveBeenCalledWith(
      'job-1',
      'failed',
      expect.stringContaining('cut upsert failed')
    )
    // Cut upsert threw → delete must NOT be called (no row to clean up).
    expect(cutRepo.delete).not.toHaveBeenCalled()
    expect(sessions.open).not.toHaveBeenCalled()
    expect(sessions.remove).not.toHaveBeenCalled()
  })

  it('does not mask the original error if the cleanup itself throws', async () => {
    const cutRepo = mockCutRepo({
      delete: vi.fn().mockImplementation(() => {
        throw new Error('cleanup-secondary-error')
      })
    })
    const sessions = mockSessions({
      open: vi.fn().mockImplementation(() => {
        throw new Error('original-error')
      })
    })
    const { useCase } = build({ cutRepo, sessions })

    // The catch block swallows secondary errors so the original
    // surfaces to the IPC caller intact.
    await expect(useCase.execute(trimRequest())).rejects.toThrow('original-error')
  })
})
