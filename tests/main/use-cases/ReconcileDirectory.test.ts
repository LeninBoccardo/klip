import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReconcileDirectory } from '@use-cases/ReconcileDirectory'
import type { ICreatorRepository, IVideoRepository, ICutRepository } from '@domain/repositories'
import type { IFileSystemReader } from '@domain/ports'
import type { Creator, Video, Cut } from '@domain/entities'

// ── Factory helpers ──

function makeCreator(overrides: Partial<Creator> = {}): Creator {
  return {
    id: 'creator-1',
    name: 'creator-1',
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
    title: 'video-1',
    url: null,
    duration: null,
    resolution: null,
    fileSize: null,
    filePath: '/root/creator-1/downloads/video-1',
    thumbnailPath: null,
    downloadDate: null,
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
    title: 'cut-1',
    tags: [],
    startTimestamp: null,
    endTimestamp: null,
    duration: null,
    resolution: null,
    fileSize: null,
    filePath: '/root/creator-1/cuts/cut-1',
    thumbnailPath: null,
    status: 'active',
    deletedAt: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides
  }
}

// ── Mock builders ──

function mockCreatorRepo(): ICreatorRepository {
  return {
    findAll: vi.fn().mockReturnValue([]),
    findAllActive: vi.fn().mockReturnValue([]),
    findById: vi.fn().mockReturnValue(null),
    upsert: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
    findPaginated: vi.fn()
  }
}

function mockVideoRepo(): IVideoRepository {
  return {
    findAll: vi.fn().mockReturnValue([]),
    findAllActive: vi.fn().mockReturnValue([]),
    findById: vi.fn().mockReturnValue(null),
    findByCreatorId: vi.fn().mockReturnValue([]),
    upsert: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
    findPaginated: vi.fn()
  }
}

function mockCutRepo(): ICutRepository {
  return {
    findAll: vi.fn().mockReturnValue([]),
    findAllActive: vi.fn().mockReturnValue([]),
    findById: vi.fn().mockReturnValue(null),
    findByCreatorId: vi.fn().mockReturnValue([]),
    findByVideoId: vi.fn().mockReturnValue([]),
    findByTags: vi.fn().mockReturnValue([]),
    upsert: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
    findPaginated: vi.fn()
  }
}

function mockFs(overrides: Partial<IFileSystemReader> = {}): IFileSystemReader {
  return {
    directoryExists: vi.fn().mockReturnValue(false),
    fileExists: vi.fn().mockReturnValue(false),
    listDirectories: vi.fn().mockReturnValue([]),
    listFiles: vi.fn().mockReturnValue([]),
    readJsonFile: vi.fn().mockReturnValue(null),
    ...overrides
  }
}

// ── Tests ──

describe('ReconcileDirectory', () => {
  let creatorRepo: ReturnType<typeof mockCreatorRepo>
  let videoRepo: ReturnType<typeof mockVideoRepo>
  let cutRepo: ReturnType<typeof mockCutRepo>
  let fs: ReturnType<typeof mockFs>
  let useCase: ReconcileDirectory

  const ROOT = '/root'

  beforeEach(() => {
    creatorRepo = mockCreatorRepo()
    videoRepo = mockVideoRepo()
    cutRepo = mockCutRepo()
    fs = mockFs()
    useCase = new ReconcileDirectory(creatorRepo, videoRepo, cutRepo, fs)
  })

  it('returns zero counts when DB and disk are both empty', () => {
    const result = useCase.execute(ROOT)

    expect(result.creatorsAdded).toBe(0)
    expect(result.creatorsMarkedMissing).toBe(0)
    expect(result.videosAdded).toBe(0)
    expect(result.cutsAdded).toBe(0)
  })

  it('discovers a new creator folder from disk and upserts it', () => {
    fs.listDirectories = vi.fn().mockImplementation((path: string) => {
      if (path === ROOT) return ['NewCreator']
      return []
    })

    const result = useCase.execute(ROOT)

    expect(result.creatorsAdded).toBe(1)
    expect(creatorRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'NewCreator', name: 'NewCreator', status: 'active' })
    )
  })

  it('uses creator.json for name when available', () => {
    fs.listDirectories = vi.fn().mockImplementation((path: string) => {
      if (path === ROOT) return ['some-creator']
      return []
    })
    fs.readJsonFile = vi.fn().mockImplementation((path: string) => {
      if (path.endsWith('creator.json')) return { name: 'Display Name' }
      return null
    })

    useCase.execute(ROOT)

    expect(creatorRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'some-creator', name: 'Display Name' })
    )
  })

  it('marks an existing DB creator as missing when its folder is gone', () => {
    creatorRepo.findAll = vi.fn().mockReturnValue([makeCreator()])
    fs.listDirectories = vi.fn().mockReturnValue([]) // no folders on disk

    const result = useCase.execute(ROOT)

    expect(result.creatorsMarkedMissing).toBe(1)
    expect(creatorRepo.updateStatus).toHaveBeenCalledWith('creator-1', 'missing', null)
  })

  it('cascades missing status to videos and cuts when creator folder disappears', () => {
    creatorRepo.findAll = vi.fn().mockReturnValue([makeCreator()])
    videoRepo.findAll = vi.fn().mockReturnValue([makeVideo()])
    cutRepo.findAll = vi.fn().mockReturnValue([makeCut()])
    fs.listDirectories = vi.fn().mockReturnValue([])

    const result = useCase.execute(ROOT)

    expect(result.videosMarkedMissing).toBe(1)
    expect(result.cutsMarkedMissing).toBe(1)
    expect(videoRepo.updateStatus).toHaveBeenCalledWith('video-1', 'missing', null)
    expect(cutRepo.updateStatus).toHaveBeenCalledWith('cut-1', 'missing', null)
  })

  it('recovers a previously missing creator when its folder reappears', () => {
    creatorRepo.findAll = vi.fn().mockReturnValue([makeCreator({ status: 'missing' })])
    fs.listDirectories = vi.fn().mockImplementation((path: string) => {
      if (path === ROOT) return ['creator-1']
      return []
    })

    const result = useCase.execute(ROOT)

    expect(result.creatorsRecovered).toBe(1)
    expect(creatorRepo.updateStatus).toHaveBeenCalledWith('creator-1', 'active', null)
  })

  it('never touches entities with status = deleted', () => {
    creatorRepo.findAll = vi.fn().mockReturnValue([
      makeCreator({ status: 'deleted', deletedAt: '2025-06-01' })
    ])
    fs.listDirectories = vi.fn().mockReturnValue([]) // folder gone

    const result = useCase.execute(ROOT)

    expect(result.creatorsMarkedMissing).toBe(0)
    expect(creatorRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('discovers new video folders and upserts them', () => {
    creatorRepo.findAll = vi.fn().mockReturnValue([makeCreator()])
    fs.listDirectories = vi.fn().mockImplementation((path: string) => {
      if (path === ROOT) return ['creator-1']
      if (path.endsWith('downloads')) return ['new-video']
      return []
    })
    fs.listFiles = vi.fn().mockReturnValue(['video.mp4', 'thumbnail.jpg'])
    fs.readJsonFile = vi.fn().mockImplementation((path: string) => {
      if (path.endsWith('meta.json')) return { title: 'My Video', url: 'https://yt.com/abc' }
      return null
    })

    const result = useCase.execute(ROOT)

    expect(result.videosAdded).toBe(1)
    expect(videoRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'new-video',
        creatorId: 'creator-1',
        title: 'My Video',
        url: 'https://yt.com/abc',
        status: 'active'
      })
    )
  })

  it('marks a DB video as missing when its folder is gone', () => {
    creatorRepo.findAll = vi.fn().mockReturnValue([makeCreator()])
    videoRepo.findAll = vi.fn().mockReturnValue([makeVideo()])
    fs.listDirectories = vi.fn().mockImplementation((path: string) => {
      if (path === ROOT) return ['creator-1']
      return [] // no video folders
    })

    const result = useCase.execute(ROOT)

    expect(result.videosMarkedMissing).toBe(1)
    expect(videoRepo.updateStatus).toHaveBeenCalledWith('video-1', 'missing', null)
  })

  it('discovers new cut folders and upserts them', () => {
    creatorRepo.findAll = vi.fn().mockReturnValue([makeCreator()])
    fs.listDirectories = vi.fn().mockImplementation((path: string) => {
      if (path === ROOT) return ['creator-1']
      if (path.endsWith('cuts')) return ['new-cut']
      return []
    })
    fs.listFiles = vi.fn().mockReturnValue(['cut.mp4'])
    fs.readJsonFile = vi.fn().mockImplementation((path: string) => {
      if (path.endsWith('cut-data.json'))
        return { title: 'Funny Clip', tags: ['funny'], startTimestamp: 10 }
      return null
    })

    const result = useCase.execute(ROOT)

    expect(result.cutsAdded).toBe(1)
    expect(cutRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'new-cut',
        creatorId: 'creator-1',
        title: 'Funny Clip',
        tags: ['funny'],
        startTimestamp: 10,
        status: 'active'
      })
    )
  })

  it('recovers a missing video when its folder reappears', () => {
    creatorRepo.findAll = vi.fn().mockReturnValue([makeCreator()])
    videoRepo.findAll = vi.fn().mockReturnValue([makeVideo({ status: 'missing' })])
    fs.listDirectories = vi.fn().mockImplementation((path: string) => {
      if (path === ROOT) return ['creator-1']
      if (path.endsWith('downloads')) return ['video-1']
      return []
    })
    fs.listFiles = vi.fn().mockReturnValue([])

    const result = useCase.execute(ROOT)

    expect(result.videosRecovered).toBe(1)
    expect(videoRepo.updateStatus).toHaveBeenCalledWith('video-1', 'active', null)
  })

  it('uses folder name as title fallback when no metadata JSON exists', () => {
    creatorRepo.findAll = vi.fn().mockReturnValue([makeCreator()])
    fs.listDirectories = vi.fn().mockImplementation((path: string) => {
      if (path === ROOT) return ['creator-1']
      if (path.endsWith('downloads')) return ['some-video-id']
      return []
    })
    fs.listFiles = vi.fn().mockReturnValue([])
    fs.readJsonFile = vi.fn().mockReturnValue(null)

    useCase.execute(ROOT)

    expect(videoRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'some-video-id', title: 'some-video-id' })
    )
  })
})

