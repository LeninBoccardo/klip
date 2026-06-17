import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MoveVideosToCreator } from '@use-cases/MoveVideosToCreator'
import type { ICreatorRepository, IVideoRepository } from '@domain/repositories'
import type {
  IFileSystemReader,
  IFileSystemWriter,
  IPathResolver,
  INotifier,
  RootPathRef
} from '@domain/ports'
import type { Video, Creator } from '@domain/entities'

function makeVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: 'v-1',
    creatorId: 'old',
    title: 't',
    url: null,
    duration: null,
    resolution: null,
    fileSize: null,
    filePath: '/root/old/downloads/v-1/v-1.mp4',
    thumbnailPath: '/root/old/downloads/v-1/thumb.jpg',
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

function makeCreator(id: string): Creator {
  return {
    id,
    folderName: id,
    name: id,
    profileImagePath: null,
    youtubeChannelId: null,
    youtubeChannelUrl: null,
    subscriberCount: null,
    avatarUrl: null,
    notes: null,
    tags: [],
    status: 'active',
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

describe('MoveVideosToCreator', () => {
  let videoRepo: IVideoRepository
  let creatorRepo: ICreatorRepository
  let fsReader: IFileSystemReader
  let fsWriter: IFileSystemWriter
  let pathResolver: IPathResolver
  let notifier: INotifier
  let rootPath: RootPathRef
  let useCase: MoveVideosToCreator

  beforeEach(() => {
    videoRepo = {
      findAll: vi.fn(),
      findAllActive: vi.fn(),
      findById: vi.fn(),
      findByCreatorId: vi.fn(),
      findByProbeStatus: vi.fn(),
      findNeedingDetail: vi.fn(),
      findMissingForRecovery: vi.fn().mockReturnValue([]),
      findByTags: vi.fn(),
      getAllDistinctTags: vi.fn(),
      findPaginated: vi.fn(),
      upsert: vi.fn(),
      upsertWithPrevious: vi.fn(),
      updateStatus: vi.fn(),
      updateProbeStatus: vi.fn(),
      delete: vi.fn(),
      updateFilePathPrefix: vi.fn()
    }
    creatorRepo = {
      findAll: vi.fn(),
      findAllActive: vi.fn(),
      findById: vi.fn(),
      findByYoutubeChannelId: vi.fn(),
      findPaginated: vi.fn(),
      upsert: vi.fn(),
      upsertWithPrevious: vi.fn(),
      updateStatus: vi.fn(),
      delete: vi.fn(),
      searchByName: vi.fn()
    } as unknown as ICreatorRepository
    fsReader = {
      directoryExists: vi.fn().mockReturnValue(true),
      fileExists: vi.fn(),
      listDirectories: vi.fn(),
      listFiles: vi.fn(),
      readJsonFile: vi.fn(),
      readTextFile: vi.fn()
    }
    fsWriter = {
      ensureDirectory: vi.fn(),
      writeFile: vi.fn(),
      renameDirectory: vi.fn(),
      moveDirectory: vi.fn(),
      isDirectoryEmpty: vi.fn()
    }
    pathResolver = {
      join: (...segs: string[]) => segs.join('/'),
      dirname: vi.fn()
    }
    notifier = { notify: vi.fn() }
    rootPath = { value: '/root' }
    useCase = new MoveVideosToCreator(
      videoRepo,
      creatorRepo,
      fsReader,
      fsWriter,
      pathResolver,
      notifier,
      rootPath
    )
  })

  it('throws EmptyVideoIdsError on empty videoIds', async () => {
    await expect(useCase.execute({ videoIds: [], targetCreatorId: 'new' })).rejects.toMatchObject({
      name: 'EmptyVideoIdsError'
    })
  })

  it('throws EmptyTargetCreatorError on empty targetCreatorId', async () => {
    await expect(useCase.execute({ videoIds: ['v-1'], targetCreatorId: '' })).rejects.toMatchObject(
      { name: 'EmptyTargetCreatorError' }
    )
  })

  it('throws TargetCreatorNotFoundError when target creator does not exist', async () => {
    vi.mocked(creatorRepo.findById).mockReturnValue(null)
    await expect(
      useCase.execute({ videoIds: ['v-1'], targetCreatorId: 'ghost' })
    ).rejects.toMatchObject({ name: 'TargetCreatorNotFoundError' })
  })

  it('moves a video on disk and rewrites paths in the DB row', async () => {
    vi.mocked(creatorRepo.findById).mockImplementation((id: string) => makeCreator(id))
    const video = makeVideo({ id: 'v-1', creatorId: 'old' })
    vi.mocked(videoRepo.findById).mockReturnValue(video)

    const result = await useCase.execute({ videoIds: ['v-1'], targetCreatorId: 'new' })

    expect(result.moved).toBe(1)
    expect(fsWriter.moveDirectory).toHaveBeenCalledWith(
      '/root/old/downloads/v-1',
      '/root/new/downloads/v-1'
    )
    const [updated] = vi.mocked(videoRepo.upsertWithPrevious).mock.calls[0]
    expect(updated.creatorId).toBe('new')
    expect(updated.filePath).toBe('/root/new/downloads/v-1/v-1.mp4')
    expect(updated.thumbnailPath).toBe('/root/new/downloads/v-1/thumb.jpg')
  })

  it('builds disk paths from folderName, not the entity id (F03)', async () => {
    // Registered creators carry a UUID id with a separate slug folderName.
    // Using the id for disk paths pointed at a directory that never existed,
    // so the move was silently skipped while the DB creatorId flipped anyway
    // — a permanent mis-linkage. Paths must be keyed by folderName.
    const source: Creator = { ...makeCreator('uuid-source'), folderName: 'source-slug' }
    const target: Creator = { ...makeCreator('uuid-target'), folderName: 'target-slug' }
    vi.mocked(creatorRepo.findById).mockImplementation((id: string) =>
      id === 'uuid-target' ? target : id === 'uuid-source' ? source : null
    )
    const video = makeVideo({
      id: 'v-1',
      creatorId: 'uuid-source',
      filePath: '/root/source-slug/downloads/v-1/v-1.mp4',
      thumbnailPath: '/root/source-slug/downloads/v-1/thumb.jpg'
    })
    vi.mocked(videoRepo.findById).mockReturnValue(video)

    const result = await useCase.execute({ videoIds: ['v-1'], targetCreatorId: 'uuid-target' })

    expect(result.moved).toBe(1)
    // Disk paths use the slugs, never the UUIDs.
    expect(fsWriter.moveDirectory).toHaveBeenCalledWith(
      '/root/source-slug/downloads/v-1',
      '/root/target-slug/downloads/v-1'
    )
    const [updated] = vi.mocked(videoRepo.upsertWithPrevious).mock.calls[0]
    // ...but the DB FK references the target's UUID id.
    expect(updated.creatorId).toBe('uuid-target')
    expect(updated.filePath).toBe('/root/target-slug/downloads/v-1/v-1.mp4')
  })

  it('records an error when the source creator cannot be resolved', async () => {
    vi.mocked(creatorRepo.findById).mockImplementation((id: string) =>
      id === 'new' ? makeCreator('new') : null
    )
    vi.mocked(videoRepo.findById).mockReturnValue(makeVideo({ id: 'v-1', creatorId: 'orphan' }))

    const result = await useCase.execute({ videoIds: ['v-1'], targetCreatorId: 'new' })

    expect(result.moved).toBe(0)
    expect(result.errors['v-1']).toContain('orphan')
    expect(fsWriter.moveDirectory).not.toHaveBeenCalled()
  })

  it('skips videos that are already in the target creator', async () => {
    vi.mocked(creatorRepo.findById).mockImplementation((id: string) => makeCreator(id))
    vi.mocked(videoRepo.findById).mockReturnValue(makeVideo({ creatorId: 'new' }))

    const result = await useCase.execute({ videoIds: ['v-1'], targetCreatorId: 'new' })

    expect(result.moved).toBe(0)
    expect(result.skipped).toBe(1)
    expect(fsWriter.moveDirectory).not.toHaveBeenCalled()
  })

  it('skips videos with status != active', async () => {
    vi.mocked(creatorRepo.findById).mockImplementation((id: string) => makeCreator(id))
    vi.mocked(videoRepo.findById).mockReturnValue(makeVideo({ status: 'deleted' }))

    const result = await useCase.execute({ videoIds: ['v-1'], targetCreatorId: 'new' })

    expect(result.moved).toBe(0)
    expect(result.skipped).toBe(1)
  })

  it('still updates the DB when source dir is missing on disk', async () => {
    vi.mocked(creatorRepo.findById).mockImplementation((id: string) => makeCreator(id))
    vi.mocked(videoRepo.findById).mockReturnValue(makeVideo())
    vi.mocked(fsReader.directoryExists).mockReturnValue(false)

    const result = await useCase.execute({ videoIds: ['v-1'], targetCreatorId: 'new' })

    expect(result.moved).toBe(1)
    expect(fsWriter.moveDirectory).not.toHaveBeenCalled()
    expect(videoRepo.upsertWithPrevious).toHaveBeenCalled()
  })

  it('records per-video errors without aborting the batch', async () => {
    vi.mocked(creatorRepo.findById).mockImplementation((id: string) => makeCreator(id))
    vi.mocked(videoRepo.findById)
      .mockReturnValueOnce(makeVideo({ id: 'v-1', creatorId: 'old' }))
      .mockReturnValueOnce(makeVideo({ id: 'v-2', creatorId: 'old' }))
    // First moveDirectory throws; second succeeds.
    let callCount = 0
    vi.mocked(fsWriter.moveDirectory).mockImplementation(() => {
      callCount++
      if (callCount === 1) throw new Error('EACCES')
    })

    const result = await useCase.execute({
      videoIds: ['v-1', 'v-2'],
      targetCreatorId: 'new'
    })

    expect(result.moved).toBe(1)
    expect(result.errors['v-1']).toContain('EACCES')
    expect(videoRepo.upsertWithPrevious).toHaveBeenCalledTimes(1)
  })

  it('emits a single db-updated notification when at least one move succeeds', async () => {
    vi.mocked(creatorRepo.findById).mockImplementation((id: string) => makeCreator(id))
    vi.mocked(videoRepo.findById).mockReturnValue(makeVideo())

    await useCase.execute({ videoIds: ['v-1'], targetCreatorId: 'new' })

    expect(notifier.notify).toHaveBeenCalledTimes(1)
    expect(notifier.notify).toHaveBeenCalledWith('db-updated', {
      scope: ['videos', 'creators']
    })
  })

  it('does not emit db-updated when nothing moved', async () => {
    vi.mocked(creatorRepo.findById).mockImplementation((id: string) => makeCreator(id))
    vi.mocked(videoRepo.findById).mockReturnValue(makeVideo({ creatorId: 'new' }))

    await useCase.execute({ videoIds: ['v-1'], targetCreatorId: 'new' })
    expect(notifier.notify).not.toHaveBeenCalled()
  })
})
