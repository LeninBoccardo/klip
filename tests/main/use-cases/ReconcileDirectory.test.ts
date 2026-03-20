import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReconcileDirectory } from '@use-cases/ReconcileDirectory'
import type { ICreatorRepository, IVideoRepository, ICutRepository } from '@domain/repositories'
import type { IFileSystemReader, IPathResolver, ITransactionScope } from '@domain/ports'
import type { Creator, Video, Cut } from '@domain/entities'

// ── Factory helpers ──

function makeCreator(overrides: Partial<Creator> = {}): Creator {
  return {
    id: 'creator-1',
    folderName: 'creator-1',
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
    findByFolderName: vi.fn().mockReturnValue(null),
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

function mockPath(): IPathResolver {
  return {
    join: vi.fn((...segments: string[]) => segments.join('/'))
  }
}

function mockTransaction(): ITransactionScope {
  return {
    run: vi.fn(<T>(fn: () => T) => fn())
  }
}

// ── Tests ──

describe('ReconcileDirectory', () => {
  let creatorRepo: ReturnType<typeof mockCreatorRepo>
  let videoRepo: ReturnType<typeof mockVideoRepo>
  let cutRepo: ReturnType<typeof mockCutRepo>
  let fs: ReturnType<typeof mockFs>
  let path: ReturnType<typeof mockPath>
  let transaction: ReturnType<typeof mockTransaction>
  let useCase: ReconcileDirectory

  const ROOT = '/root'

  beforeEach(() => {
    creatorRepo = mockCreatorRepo()
    videoRepo = mockVideoRepo()
    cutRepo = mockCutRepo()
    fs = mockFs()
    path = mockPath()
    transaction = mockTransaction()
    useCase = new ReconcileDirectory(creatorRepo, videoRepo, cutRepo, fs, path, transaction)
  })

  // ── execute ──

  it('returns zero counts when DB and disk are both empty', () => {
    const result = useCase.execute(ROOT)

    expect(result.creatorsAdded).toBe(0)
    expect(result.creatorsMarkedMissing).toBe(0)
    expect(result.videosAdded).toBe(0)
    expect(result.cutsAdded).toBe(0)
  })

  it('wraps execute in a transaction', () => {
    useCase.execute(ROOT)
    expect(transaction.run).toHaveBeenCalledOnce()
  })

  it('discovers a new creator folder from disk and upserts it', () => {
    fs.listDirectories = vi.fn().mockImplementation((p: string) => {
      if (p === ROOT) return ['NewCreator']
      return []
    })

    const result = useCase.execute(ROOT)

    expect(result.creatorsAdded).toBe(1)
    expect(creatorRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'NewCreator', name: 'NewCreator', status: 'active' })
    )
  })

  it('uses creator.json for name when available', () => {
    fs.listDirectories = vi.fn().mockImplementation((p: string) => {
      if (p === ROOT) return ['some-creator']
      return []
    })
    fs.readJsonFile = vi.fn().mockImplementation((p: string) => {
      if (p.endsWith('creator.json')) return { name: 'Display Name' }
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
    videoRepo.findByCreatorId = vi.fn().mockReturnValue([makeVideo()])
    cutRepo.findByCreatorId = vi.fn().mockReturnValue([makeCut()])
    fs.listDirectories = vi.fn().mockReturnValue([])

    const result = useCase.execute(ROOT)

    expect(result.videosMarkedMissing).toBe(1)
    expect(result.cutsMarkedMissing).toBe(1)
    expect(videoRepo.updateStatus).toHaveBeenCalledWith('video-1', 'missing', null)
    expect(cutRepo.updateStatus).toHaveBeenCalledWith('cut-1', 'missing', null)
  })

  it('recovers a previously missing creator when its folder reappears', () => {
    creatorRepo.findAll = vi.fn().mockReturnValue([makeCreator({ status: 'missing' })])
    fs.listDirectories = vi.fn().mockImplementation((p: string) => {
      if (p === ROOT) return ['creator-1']
      return []
    })

    const result = useCase.execute(ROOT)

    expect(result.creatorsRecovered).toBe(1)
    expect(creatorRepo.updateStatus).toHaveBeenCalledWith('creator-1', 'active', null)
  })

  it('never touches entities with status = deleted', () => {
    creatorRepo.findAll = vi
      .fn()
      .mockReturnValue([makeCreator({ status: 'deleted', deletedAt: '2025-06-01' })])
    fs.listDirectories = vi.fn().mockReturnValue([]) // folder gone

    const result = useCase.execute(ROOT)

    expect(result.creatorsMarkedMissing).toBe(0)
    expect(creatorRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('discovers new video folders and upserts them', () => {
    creatorRepo.findAll = vi.fn().mockReturnValue([makeCreator()])
    fs.listDirectories = vi.fn().mockImplementation((p: string) => {
      if (p === ROOT) return ['creator-1']
      if (p.endsWith('downloads')) return ['new-video']
      return []
    })
    fs.listFiles = vi.fn().mockReturnValue(['video.mp4', 'thumbnail.jpg'])
    fs.readJsonFile = vi.fn().mockImplementation((p: string) => {
      if (p.endsWith('meta.json')) return { title: 'My Video', url: 'https://yt.com/abc' }
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
    videoRepo.findByCreatorId = vi.fn().mockReturnValue([makeVideo()])
    fs.listDirectories = vi.fn().mockImplementation((p: string) => {
      if (p === ROOT) return ['creator-1']
      return [] // no video folders
    })

    const result = useCase.execute(ROOT)

    expect(result.videosMarkedMissing).toBe(1)
    expect(videoRepo.updateStatus).toHaveBeenCalledWith('video-1', 'missing', null)
  })

  it('discovers new cut folders and upserts them', () => {
    creatorRepo.findAll = vi.fn().mockReturnValue([makeCreator()])
    fs.listDirectories = vi.fn().mockImplementation((p: string) => {
      if (p === ROOT) return ['creator-1']
      if (p.endsWith('cuts')) return ['new-cut']
      return []
    })
    fs.listFiles = vi.fn().mockReturnValue(['cut.mp4'])
    fs.readJsonFile = vi.fn().mockImplementation((p: string) => {
      if (p.endsWith('cut-data.json'))
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
    videoRepo.findByCreatorId = vi.fn().mockReturnValue([makeVideo({ status: 'missing' })])
    fs.listDirectories = vi.fn().mockImplementation((p: string) => {
      if (p === ROOT) return ['creator-1']
      if (p.endsWith('downloads')) return ['video-1']
      return []
    })
    fs.listFiles = vi.fn().mockReturnValue([])

    const result = useCase.execute(ROOT)

    expect(result.videosRecovered).toBe(1)
    expect(videoRepo.updateStatus).toHaveBeenCalledWith('video-1', 'active', null)
  })

  it('uses folder name as title fallback when no metadata JSON exists', () => {
    creatorRepo.findAll = vi.fn().mockReturnValue([makeCreator()])
    fs.listDirectories = vi.fn().mockImplementation((p: string) => {
      if (p === ROOT) return ['creator-1']
      if (p.endsWith('downloads')) return ['some-video-id']
      return []
    })
    fs.listFiles = vi.fn().mockReturnValue([])
    fs.readJsonFile = vi.fn().mockReturnValue(null)

    useCase.execute(ROOT)

    expect(videoRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'some-video-id', title: 'some-video-id' })
    )
  })

  // ── Bug fix #3: discoverVideos does not overwrite existing entities ──

  it('does NOT overwrite an existing active video during discoverVideos', () => {
    // New creator on disk has a video folder that already exists in DB (edge case)
    fs.listDirectories = vi.fn().mockImplementation((p: string) => {
      if (p === ROOT) return ['new-creator']
      if (p.endsWith('downloads')) return ['existing-video']
      return []
    })
    videoRepo.findById = vi
      .fn()
      .mockReturnValue(makeVideo({ id: 'existing-video', status: 'active' }))

    const result = useCase.execute(ROOT)

    expect(result.creatorsAdded).toBe(1)
    // Should NOT call upsert for the existing video
    expect(videoRepo.upsert).not.toHaveBeenCalled()
    expect(result.videosAdded).toBe(0)
  })

  it('recovers a missing video found during discoverVideos', () => {
    fs.listDirectories = vi.fn().mockImplementation((p: string) => {
      if (p === ROOT) return ['new-creator']
      if (p.endsWith('downloads')) return ['missing-video']
      return []
    })
    videoRepo.findById = vi
      .fn()
      .mockReturnValue(makeVideo({ id: 'missing-video', status: 'missing' }))

    const result = useCase.execute(ROOT)

    expect(result.videosRecovered).toBe(1)
    expect(videoRepo.updateStatus).toHaveBeenCalledWith('missing-video', 'active', null)
    expect(videoRepo.upsert).not.toHaveBeenCalled()
  })

  // ── Multi-creator scenarios ──

  it('handles multiple creators with mixed statuses correctly', () => {
    creatorRepo.findAll = vi.fn().mockReturnValue([
      makeCreator({ id: 'active-c', name: 'active-c', status: 'active' }),
      makeCreator({ id: 'missing-c', name: 'missing-c', status: 'missing' }),
      makeCreator({
        id: 'deleted-c',
        name: 'deleted-c',
        status: 'deleted',
        deletedAt: '2025-06-01'
      })
    ])
    fs.listDirectories = vi.fn().mockImplementation((p: string) => {
      if (p === ROOT) return ['active-c', 'missing-c', 'brand-new']
      return []
    })

    const result = useCase.execute(ROOT)

    // active-c: still on disk, no change
    // missing-c: back on disk → recovered
    expect(result.creatorsRecovered).toBe(1)
    expect(creatorRepo.updateStatus).toHaveBeenCalledWith('missing-c', 'active', null)
    // deleted-c: not on disk but skipped (deleted)
    expect(result.creatorsMarkedMissing).toBe(0)
    // brand-new: discovered from disk
    expect(result.creatorsAdded).toBe(1)
    expect(creatorRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'brand-new', status: 'active' })
    )
  })

  // ── executeForCreator ──

  describe('executeForCreator', () => {
    it('wraps in a transaction', () => {
      useCase.executeForCreator(ROOT, 'some-creator')
      expect(transaction.run).toHaveBeenCalledOnce()
    })

    it('discovers a brand-new creator when folder exists', () => {
      fs.directoryExists = vi.fn().mockReturnValue(true)
      fs.listDirectories = vi.fn().mockReturnValue([])

      const result = useCase.executeForCreator(ROOT, 'new-creator')

      expect(result.creatorsAdded).toBe(1)
      expect(creatorRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'new-creator', status: 'active' })
      )
    })

    it('marks existing creator as missing when folder is gone', () => {
      creatorRepo.findById = vi.fn().mockReturnValue(makeCreator({ id: 'c1', name: 'c1' }))
      fs.directoryExists = vi.fn().mockReturnValue(false)
      videoRepo.findByCreatorId = vi.fn().mockReturnValue([])
      cutRepo.findByCreatorId = vi.fn().mockReturnValue([])

      const result = useCase.executeForCreator(ROOT, 'c1')

      expect(result.creatorsMarkedMissing).toBe(1)
      expect(creatorRepo.updateStatus).toHaveBeenCalledWith('c1', 'missing', null)
    })

    it('recovers a missing creator when folder reappears', () => {
      creatorRepo.findById = vi
        .fn()
        .mockReturnValue(makeCreator({ id: 'c1', name: 'c1', status: 'missing' }))
      fs.directoryExists = vi.fn().mockReturnValue(true)
      fs.listDirectories = vi.fn().mockReturnValue([])

      const result = useCase.executeForCreator(ROOT, 'c1')

      expect(result.creatorsRecovered).toBe(1)
      expect(creatorRepo.updateStatus).toHaveBeenCalledWith('c1', 'active', null)
    })

    it('skips deleted creators even if folder reappears', () => {
      creatorRepo.findById = vi
        .fn()
        .mockReturnValue(makeCreator({ id: 'c1', name: 'c1', status: 'deleted' }))
      fs.directoryExists = vi.fn().mockReturnValue(true)

      const result = useCase.executeForCreator(ROOT, 'c1')

      expect(result.creatorsRecovered).toBe(0)
      expect(result.creatorsAdded).toBe(0)
      expect(creatorRepo.updateStatus).not.toHaveBeenCalled()
    })

    it('returns empty result when creator not in DB and folder does not exist', () => {
      fs.directoryExists = vi.fn().mockReturnValue(false)

      const result = useCase.executeForCreator(ROOT, 'ghost')

      expect(result.creatorsAdded).toBe(0)
      expect(result.creatorsMarkedMissing).toBe(0)
    })

    it('reconciles videos and cuts for an existing active creator', () => {
      creatorRepo.findById = vi.fn().mockReturnValue(makeCreator({ id: 'c1', name: 'c1' }))
      fs.directoryExists = vi.fn().mockReturnValue(true)
      fs.listDirectories = vi.fn().mockImplementation((p: string) => {
        if (p.endsWith('downloads')) return ['new-vid']
        if (p.endsWith('cuts')) return ['new-cut']
        return []
      })
      fs.listFiles = vi.fn().mockReturnValue(['video.mp4'])
      fs.readJsonFile = vi.fn().mockReturnValue(null)

      const result = useCase.executeForCreator(ROOT, 'c1')

      expect(result.videosAdded).toBe(1)
      expect(result.cutsAdded).toBe(1)
    })
  })

  // ── Edge cases: Partial/malformed metadata ──

  describe('metadata edge cases', () => {
    it('handles meta.json with partial fields (missing title)', () => {
      creatorRepo.findAll = vi.fn().mockReturnValue([makeCreator()])
      fs.listDirectories = vi.fn().mockImplementation((p: string) => {
        if (p === ROOT) return ['creator-1']
        if (p.endsWith('downloads')) return ['vid-partial']
        return []
      })
      fs.listFiles = vi.fn().mockReturnValue([])
      fs.readJsonFile = vi.fn().mockImplementation((p: string) => {
        if (p.endsWith('meta.json')) return { url: 'https://yt.com/x' } // no title
        return null
      })

      useCase.execute(ROOT)

      expect(videoRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'vid-partial', title: 'vid-partial', url: 'https://yt.com/x' })
      )
    })

    it('handles cut-data.json with null tags and missing title', () => {
      creatorRepo.findAll = vi.fn().mockReturnValue([makeCreator()])
      fs.listDirectories = vi.fn().mockImplementation((p: string) => {
        if (p === ROOT) return ['creator-1']
        if (p.endsWith('cuts')) return ['cut-partial']
        return []
      })
      fs.listFiles = vi.fn().mockReturnValue([])
      fs.readJsonFile = vi.fn().mockImplementation((p: string) => {
        if (p.endsWith('cut-data.json')) return { startTimestamp: 5 } // no title, no tags
        return null
      })

      useCase.execute(ROOT)

      expect(cutRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'cut-partial',
          title: 'cut-partial',
          tags: [],
          startTimestamp: 5
        })
      )
    })

    it('reads profileImagePath from creator.json', () => {
      fs.listDirectories = vi.fn().mockImplementation((p: string) => {
        if (p === ROOT) return ['new-creator']
        return []
      })
      fs.readJsonFile = vi.fn().mockImplementation((p: string) => {
        if (p.endsWith('creator.json'))
          return { name: 'The Creator', profileImagePath: '/img/avatar.jpg' }
        return null
      })

      useCase.execute(ROOT)

      expect(creatorRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'The Creator',
          profileImagePath: '/img/avatar.jpg'
        })
      )
    })
  })

  // ── Edge cases: media and thumbnail file detection ──

  describe('file detection in video/cut directories', () => {
    it('detects .mkv and .webm video files', () => {
      creatorRepo.findAll = vi.fn().mockReturnValue([makeCreator()])
      fs.listDirectories = vi.fn().mockImplementation((p: string) => {
        if (p === ROOT) return ['creator-1']
        if (p.endsWith('downloads')) return ['vid-mkv']
        return []
      })
      fs.listFiles = vi.fn().mockReturnValue(['clip.mkv', 'thumbnail.png'])
      fs.readJsonFile = vi.fn().mockReturnValue(null)

      useCase.execute(ROOT)

      expect(videoRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          filePath: expect.stringContaining('clip.mkv'),
          thumbnailPath: expect.stringContaining('thumbnail.png')
        })
      )
    })

    it('ignores non-media files and non-thumbnail files', () => {
      creatorRepo.findAll = vi.fn().mockReturnValue([makeCreator()])
      fs.listDirectories = vi.fn().mockImplementation((p: string) => {
        if (p === ROOT) return ['creator-1']
        if (p.endsWith('downloads')) return ['vid-other']
        return []
      })
      fs.listFiles = vi.fn().mockReturnValue(['readme.txt', 'notes.pdf'])
      fs.readJsonFile = vi.fn().mockReturnValue(null)

      useCase.execute(ROOT)

      // filePath falls back to videoDir, thumbnailPath is null
      expect(videoRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          filePath: expect.stringContaining('vid-other'),
          thumbnailPath: null
        })
      )
    })

    it('detects thumbnail.webp format', () => {
      creatorRepo.findAll = vi.fn().mockReturnValue([makeCreator()])
      fs.listDirectories = vi.fn().mockImplementation((p: string) => {
        if (p === ROOT) return ['creator-1']
        if (p.endsWith('cuts')) return ['cut-webp']
        return []
      })
      fs.listFiles = vi.fn().mockReturnValue(['cut.mp4', 'thumbnail.webp'])
      fs.readJsonFile = vi.fn().mockReturnValue(null)

      useCase.execute(ROOT)

      expect(cutRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          thumbnailPath: expect.stringContaining('thumbnail.webp')
        })
      )
    })
  })

  // ── Edge cases: already-missing entities don't re-increment counters ──

  describe('already-missing entities stay missing', () => {
    it('does NOT re-mark an already missing creator', () => {
      creatorRepo.findAll = vi.fn().mockReturnValue([makeCreator({ status: 'missing' })])
      fs.listDirectories = vi.fn().mockReturnValue([]) // still gone

      const result = useCase.execute(ROOT)

      expect(result.creatorsMarkedMissing).toBe(0)
      expect(creatorRepo.updateStatus).not.toHaveBeenCalled()
    })

    it('does NOT re-mark already missing videos during reconcileVideos', () => {
      creatorRepo.findAll = vi.fn().mockReturnValue([makeCreator()])
      videoRepo.findByCreatorId = vi.fn().mockReturnValue([makeVideo({ status: 'missing' })])
      fs.listDirectories = vi.fn().mockImplementation((p: string) => {
        if (p === ROOT) return ['creator-1']
        return [] // no video folders
      })

      const result = useCase.execute(ROOT)

      expect(result.videosMarkedMissing).toBe(0)
      expect(videoRepo.updateStatus).not.toHaveBeenCalled()
    })

    it('does NOT re-mark already missing cuts during reconcileCuts', () => {
      creatorRepo.findAll = vi.fn().mockReturnValue([makeCreator()])
      cutRepo.findByCreatorId = vi.fn().mockReturnValue([makeCut({ status: 'missing' })])
      fs.listDirectories = vi.fn().mockImplementation((p: string) => {
        if (p === ROOT) return ['creator-1']
        return []
      })

      const result = useCase.execute(ROOT)

      expect(result.cutsMarkedMissing).toBe(0)
      expect(cutRepo.updateStatus).not.toHaveBeenCalled()
    })
  })

  // ── Edge cases: deleted children inside active creator ──

  describe('deleted children are skipped during reconciliation', () => {
    it('skips deleted videos during reconcileVideos', () => {
      creatorRepo.findAll = vi.fn().mockReturnValue([makeCreator()])
      videoRepo.findByCreatorId = vi
        .fn()
        .mockReturnValue([makeVideo({ status: 'deleted', deletedAt: '2025-06-01' })])
      fs.listDirectories = vi.fn().mockImplementation((p: string) => {
        if (p === ROOT) return ['creator-1']
        return [] // folder gone
      })

      const result = useCase.execute(ROOT)

      expect(result.videosMarkedMissing).toBe(0)
      expect(videoRepo.updateStatus).not.toHaveBeenCalled()
    })

    it('skips deleted cuts during reconcileCuts', () => {
      creatorRepo.findAll = vi.fn().mockReturnValue([makeCreator()])
      cutRepo.findByCreatorId = vi
        .fn()
        .mockReturnValue([makeCut({ status: 'deleted', deletedAt: '2025-06-01' })])
      fs.listDirectories = vi.fn().mockImplementation((p: string) => {
        if (p === ROOT) return ['creator-1']
        return []
      })

      const result = useCase.execute(ROOT)

      expect(result.cutsMarkedMissing).toBe(0)
      expect(cutRepo.updateStatus).not.toHaveBeenCalled()
    })
  })

  // ── Edge cases: discoverCuts guards (mirroring discoverVideos tests) ──

  describe('discoverCuts edge cases', () => {
    it('does NOT overwrite an existing active cut during discoverCuts', () => {
      fs.listDirectories = vi.fn().mockImplementation((p: string) => {
        if (p === ROOT) return ['new-creator']
        if (p.endsWith('cuts')) return ['existing-cut']
        return []
      })
      cutRepo.findById = vi.fn().mockReturnValue(makeCut({ id: 'existing-cut', status: 'active' }))

      const result = useCase.execute(ROOT)

      expect(cutRepo.upsert).not.toHaveBeenCalled()
      expect(result.cutsAdded).toBe(0)
    })

    it('recovers a missing cut found during discoverCuts', () => {
      fs.listDirectories = vi.fn().mockImplementation((p: string) => {
        if (p === ROOT) return ['new-creator']
        if (p.endsWith('cuts')) return ['missing-cut']
        return []
      })
      cutRepo.findById = vi.fn().mockReturnValue(makeCut({ id: 'missing-cut', status: 'missing' }))

      const result = useCase.execute(ROOT)

      expect(result.cutsRecovered).toBe(1)
      expect(cutRepo.updateStatus).toHaveBeenCalledWith('missing-cut', 'active', null)
      expect(cutRepo.upsert).not.toHaveBeenCalled()
    })
  })

  // ── Edge cases: executeForCreator cascading missing to children ──

  describe('executeForCreator cascading', () => {
    it('marks children missing when creator folder disappears', () => {
      creatorRepo.findById = vi.fn().mockReturnValue(makeCreator({ id: 'c1', name: 'c1' }))
      fs.directoryExists = vi.fn().mockReturnValue(false)
      videoRepo.findByCreatorId = vi
        .fn()
        .mockReturnValue([makeVideo({ id: 'v1', creatorId: 'c1' })])
      cutRepo.findByCreatorId = vi.fn().mockReturnValue([makeCut({ id: 'ct1', creatorId: 'c1' })])

      const result = useCase.executeForCreator(ROOT, 'c1')

      expect(result.creatorsMarkedMissing).toBe(1)
      expect(result.videosMarkedMissing).toBe(1)
      expect(result.cutsMarkedMissing).toBe(1)
    })

    it('does not mark already-missing/deleted children when cascading', () => {
      creatorRepo.findById = vi.fn().mockReturnValue(makeCreator({ id: 'c1', name: 'c1' }))
      fs.directoryExists = vi.fn().mockReturnValue(false)
      videoRepo.findByCreatorId = vi.fn().mockReturnValue([
        makeVideo({ id: 'v-active', creatorId: 'c1', status: 'active' }),
        makeVideo({ id: 'v-missing', creatorId: 'c1', status: 'missing' }),
        makeVideo({ id: 'v-deleted', creatorId: 'c1', status: 'deleted', deletedAt: '2025-06-01' })
      ])
      cutRepo.findByCreatorId = vi.fn().mockReturnValue([])

      const result = useCase.executeForCreator(ROOT, 'c1')

      // Only the active video should be marked missing
      expect(result.videosMarkedMissing).toBe(1)
      expect(videoRepo.updateStatus).toHaveBeenCalledOnce()
      expect(videoRepo.updateStatus).toHaveBeenCalledWith('v-active', 'missing', null)
    })

    it('reads creator.json for newly discovered single creator', () => {
      fs.directoryExists = vi.fn().mockReturnValue(true)
      fs.listDirectories = vi.fn().mockReturnValue([])
      fs.readJsonFile = vi.fn().mockImplementation((p: string) => {
        if (p.endsWith('creator.json')) return { name: 'Custom Display Name' }
        return null
      })

      useCase.executeForCreator(ROOT, 'new-slug')

      expect(creatorRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'new-slug',
          name: 'Custom Display Name'
        })
      )
    })
  })

  // ── Edge cases: empty downloads/cuts directories ──

  it('handles creator with empty downloads and cuts directories', () => {
    creatorRepo.findAll = vi.fn().mockReturnValue([makeCreator()])
    fs.listDirectories = vi.fn().mockImplementation((p: string) => {
      if (p === ROOT) return ['creator-1']
      return [] // empty downloads/ and cuts/
    })

    const result = useCase.execute(ROOT)

    expect(result.videosAdded).toBe(0)
    expect(result.cutsAdded).toBe(0)
    expect(result.creatorsMarkedMissing).toBe(0)
  })

  // ── Edge cases: recovers missing cut during reconcileCuts ──

  it('recovers a missing cut when its folder reappears', () => {
    creatorRepo.findAll = vi.fn().mockReturnValue([makeCreator()])
    cutRepo.findByCreatorId = vi.fn().mockReturnValue([makeCut({ status: 'missing' })])
    fs.listDirectories = vi.fn().mockImplementation((p: string) => {
      if (p === ROOT) return ['creator-1']
      if (p.endsWith('cuts')) return ['cut-1']
      return []
    })
    fs.listFiles = vi.fn().mockReturnValue([])

    const result = useCase.execute(ROOT)

    expect(result.cutsRecovered).toBe(1)
    expect(cutRepo.updateStatus).toHaveBeenCalledWith('cut-1', 'active', null)
  })
})
