import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DownloadVideo } from '@use-cases/DownloadVideo'
import type { ICreatorRepository, IVideoRepository } from '@domain/repositories'
import type {
  IVideoDownloader,
  IDownloadQueue,
  IPathResolver,
  IFileSystemWriter,
  INotifier,
  IIdGenerator
} from '@domain/ports'
import type { IFetchVideoInfo } from '@use-cases/IFetchVideoInfo'
import type { VideoInfo, DownloadProgress, DownloadResult } from '@domain/types'
import type { Creator } from '@domain/entities'

// ── Mock builders ──

function mockDownloader(overrides: Partial<IVideoDownloader> = {}): IVideoDownloader {
  return {
    fetchInfo: vi.fn(),
    download: vi.fn(),
    cancel: vi.fn(),
    ...overrides
  }
}

function mockFetchInfo(overrides: Partial<IFetchVideoInfo> = {}): IFetchVideoInfo {
  return {
    execute: vi.fn(),
    ...overrides
  }
}

/**
 * Creates a mock download queue that immediately executes tasks
 * and captures the promise so tests can await background work.
 */
function mockDownloadQueue(): IDownloadQueue & { lastTask: Promise<unknown> | null } {
  const mock: IDownloadQueue & { lastTask: Promise<unknown> | null } = {
    lastTask: null,
    enqueue: vi.fn(<T>(task: () => Promise<T>): Promise<T> => {
      const p = task()
      mock.lastTask = p.catch(() => {}) // capture but swallow so the mock doesn't reject
      return p
    }),
    pending: vi.fn().mockReturnValue(0),
    running: vi.fn().mockReturnValue(0),
    onIdle: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn()
  }
  return mock
}

function mockCreatorRepo(overrides: Partial<ICreatorRepository> = {}): ICreatorRepository {
  return {
    findAll: vi.fn().mockReturnValue([]),
    findAllActive: vi.fn().mockReturnValue([]),
    findById: vi.fn().mockReturnValue(null),
    findByFolderName: vi.fn().mockReturnValue(null),
    upsert: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
    findPaginated: vi.fn(),
    ...overrides
  }
}

function mockVideoRepo(overrides: Partial<IVideoRepository> = {}): IVideoRepository {
  return {
    findAll: vi.fn().mockReturnValue([]),
    findAllActive: vi.fn().mockReturnValue([]),
    findById: vi.fn().mockReturnValue(null),
    findByCreatorId: vi.fn().mockReturnValue([]),
    findByProbeStatus: vi.fn().mockReturnValue([]),
    upsert: vi.fn(),
    updateStatus: vi.fn(),
    updateProbeStatus: vi.fn(),
    delete: vi.fn(),
    findPaginated: vi.fn(),
    ...overrides
  }
}

function mockPathResolver(): IPathResolver {
  return {
    join: vi.fn((...segments: string[]) => segments.join('/'))
  }
}

function mockFsWriter(): IFileSystemWriter {
  return {
    ensureDirectory: vi.fn(),
    writeFile: vi.fn(),
    renameDirectory: vi.fn()
  }
}

function mockNotifier(): INotifier {
  return {
    notify: vi.fn()
  }
}

function mockIdGenerator(): IIdGenerator {
  let counter = 0
  return {
    generate: vi.fn(() => `test-download-id-${++counter}`)
  }
}

// ── Test data ──

const videoInfo: VideoInfo = {
  videoId: 'abc123',
  title: 'Test Video',
  channel: 'TestChannel',
  duration: 120,
  thumbnailUrl: 'https://example.com/thumb.jpg',
  description: 'A test video'
}

const downloadResult: DownloadResult = {
  downloadId: 'will-be-overwritten',
  videoId: 'abc123',
  creatorName: 'TestChannel',
  filePath: '/root/TestCreator/downloads/abc123/abc123.mp4',
  title: 'Test Video',
  duration: 120,
  thumbnailPath: '/root/TestCreator/downloads/abc123/abc123.jpg'
}

// ── Tests ──

describe('DownloadVideo', () => {
  let downloader: IVideoDownloader
  let fetchInfo: IFetchVideoInfo
  let downloadQueue: ReturnType<typeof mockDownloadQueue>
  let creatorRepo: ICreatorRepository
  let videoRepo: IVideoRepository
  let pathResolver: IPathResolver
  let fsWriter: IFileSystemWriter
  let notifier: INotifier
  let idGenerator: IIdGenerator
  let useCase: DownloadVideo

  const ROOT = '/root'

  /** Await the fire-and-forget task captured by the mock queue */
  async function awaitEnqueuedTask(): Promise<void> {
    if (downloadQueue.lastTask) await downloadQueue.lastTask
  }

  beforeEach(() => {
    downloader = mockDownloader()
    fetchInfo = mockFetchInfo()
    downloadQueue = mockDownloadQueue()
    creatorRepo = mockCreatorRepo()
    videoRepo = mockVideoRepo()
    pathResolver = mockPathResolver()
    fsWriter = mockFsWriter()
    notifier = mockNotifier()
    idGenerator = mockIdGenerator()

    vi.mocked(fetchInfo.execute).mockResolvedValue(videoInfo)
    vi.mocked(downloader.download).mockImplementation(async (opts, onProgress) => {
      onProgress({
        downloadId: opts.downloadId,
        url: opts.url,
        percent: 50,
        speed: '1.5MiB/s',
        eta: '00:30',
        status: 'downloading'
      })
      return { ...downloadResult, downloadId: opts.downloadId }
    })

    useCase = new DownloadVideo(
      downloader,
      fetchInfo,
      downloadQueue,
      creatorRepo,
      videoRepo,
      pathResolver,
      fsWriter,
      notifier,
      idGenerator,
      ROOT
    )
  })

  it('should return a downloadId immediately', async () => {
    const result = await useCase.execute({
      url: 'https://youtube.com/watch?v=abc123',
      creatorName: 'TestCreator'
    })
    expect(result.downloadId).toBeDefined()
    expect(typeof result.downloadId).toBe('string')
    expect(result.downloadId.length).toBeGreaterThan(0)
  })

  it('should notify queued status on execute', async () => {
    await useCase.execute({ url: 'https://youtube.com/watch?v=abc123', creatorName: 'TestCreator' })

    expect(notifier.notify).toHaveBeenCalledWith(
      'download-progress',
      expect.objectContaining({
        status: 'queued',
        url: 'https://youtube.com/watch?v=abc123',
        percent: 0
      })
    )
  })

  it('should enqueue the download task into the queue', async () => {
    await useCase.execute({ url: 'https://youtube.com/watch?v=abc123', creatorName: 'TestCreator' })
    expect(downloadQueue.enqueue).toHaveBeenCalledTimes(1)
  })

  it('should fetch video info before downloading', async () => {
    await useCase.execute({ url: 'https://youtube.com/watch?v=abc123', creatorName: 'TestCreator' })
    await awaitEnqueuedTask()
    expect(fetchInfo.execute).toHaveBeenCalledWith('https://youtube.com/watch?v=abc123')
  })

  it('should ensure the creator exists in the DB', async () => {
    await useCase.execute({ url: 'https://youtube.com/watch?v=abc123', creatorName: 'TestCreator' })
    await awaitEnqueuedTask()

    expect(creatorRepo.findById).toHaveBeenCalledWith('testcreator')
    expect(creatorRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'testcreator',
        folderName: 'testcreator',
        name: 'TestCreator',
        status: 'active'
      })
    )
  })

  it('should recover a missing creator instead of creating a new one', async () => {
    const missingCreator: Creator = {
      id: 'testcreator',
      folderName: 'testcreator',
      name: 'TestCreator',
      profileImagePath: null,
      status: 'missing',
      deletedAt: null,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z'
    }
    vi.mocked(creatorRepo.findById).mockReturnValue(missingCreator)

    await useCase.execute({ url: 'https://youtube.com/watch?v=abc123', creatorName: 'TestCreator' })
    await awaitEnqueuedTask()

    expect(creatorRepo.updateStatus).toHaveBeenCalledWith('testcreator', 'active', null)
    expect(creatorRepo.upsert).not.toHaveBeenCalled()
  })

  it('should create the output directory', async () => {
    await useCase.execute({ url: 'https://youtube.com/watch?v=abc123', creatorName: 'TestCreator' })
    await awaitEnqueuedTask()
    expect(fsWriter.ensureDirectory).toHaveBeenCalledWith('/root/testcreator/downloads/abc123')
  })

  it('should call downloader.download with correct options', async () => {
    const result = await useCase.execute({
      url: 'https://youtube.com/watch?v=abc123',
      creatorName: 'TestCreator'
    })
    await awaitEnqueuedTask()

    expect(downloader.download).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://youtube.com/watch?v=abc123',
        outputDir: '/root/testcreator/downloads/abc123',
        videoId: 'abc123',
        downloadId: result.downloadId
      }),
      expect.any(Function)
    )
  })

  it('should relay progress events through the notifier', async () => {
    await useCase.execute({ url: 'https://youtube.com/watch?v=abc123', creatorName: 'TestCreator' })
    await awaitEnqueuedTask()

    const progressCalls = vi
      .mocked(notifier.notify)
      .mock.calls.filter((c) => c[0] === 'download-progress')
    // At least queued + one downloading progress relay
    expect(progressCalls.length).toBeGreaterThanOrEqual(2)
    expect(progressCalls).toContainEqual([
      'download-progress',
      expect.objectContaining({ status: 'downloading', percent: 50 })
    ])
  })

  it('should upsert the Video entity on completion', async () => {
    await useCase.execute({ url: 'https://youtube.com/watch?v=abc123', creatorName: 'TestCreator' })
    await awaitEnqueuedTask()

    expect(videoRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'abc123',
        creatorId: 'testcreator',
        title: 'Test Video',
        url: 'https://youtube.com/watch?v=abc123',
        duration: 120,
        status: 'active'
      })
    )
  })

  it('should notify db-updated after successful download', async () => {
    await useCase.execute({ url: 'https://youtube.com/watch?v=abc123', creatorName: 'TestCreator' })
    await awaitEnqueuedTask()
    expect(notifier.notify).toHaveBeenCalledWith('db-updated')
  })

  it('should throw if URL is empty', async () => {
    await expect(useCase.execute({ url: '', creatorName: 'TestCreator' })).rejects.toThrow(
      'URL is required'
    )
  })

  it('should throw if creator name is empty', async () => {
    await expect(
      useCase.execute({ url: 'https://youtube.com/watch?v=abc123', creatorName: '' })
    ).rejects.toThrow('Creator name is required')
  })

  it('should cancel via downloader.cancel pass-through', () => {
    useCase.cancel('some-id')
    expect(downloader.cancel).toHaveBeenCalledWith('some-id')
  })

  it('should notify error status when download fails', async () => {
    vi.mocked(downloader.download).mockRejectedValue(new Error('Network failure'))

    await useCase.execute({ url: 'https://youtube.com/watch?v=abc123', creatorName: 'TestCreator' })
    await awaitEnqueuedTask()

    expect(notifier.notify).toHaveBeenCalledWith(
      'download-progress',
      expect.objectContaining({
        status: 'error'
      })
    )
    expect(videoRepo.upsert).not.toHaveBeenCalled()
  })

  it('should not notify error when download is cancelled', async () => {
    vi.mocked(downloader.download).mockRejectedValue(new Error('Download cancelled'))

    await useCase.execute({ url: 'https://youtube.com/watch?v=abc123', creatorName: 'TestCreator' })
    await awaitEnqueuedTask()

    const errorCalls = vi
      .mocked(notifier.notify)
      .mock.calls.filter(
        (c) => c[0] === 'download-progress' && (c[1] as DownloadProgress)?.status === 'error'
      )
    expect(errorCalls.length).toBe(0)
  })

  // ── Edge: existing active creator (no upsert/updateStatus needed) ──

  it('should not upsert or updateStatus for an existing active creator', async () => {
    const activeCreator: Creator = {
      id: 'testcreator',
      folderName: 'testcreator',
      name: 'TestCreator',
      profileImagePath: null,
      status: 'active',
      deletedAt: null,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z'
    }
    vi.mocked(creatorRepo.findById).mockReturnValue(activeCreator)

    await useCase.execute({ url: 'https://youtube.com/watch?v=abc123', creatorName: 'TestCreator' })
    await awaitEnqueuedTask()

    expect(creatorRepo.upsert).not.toHaveBeenCalled()
    expect(creatorRepo.updateStatus).not.toHaveBeenCalled()
  })

  // ── Edge: deleted creator — left as-is (intentional) ──

  it('should not recover a deleted creator', async () => {
    const deletedCreator: Creator = {
      id: 'testcreator',
      folderName: 'testcreator',
      name: 'TestCreator',
      profileImagePath: null,
      status: 'deleted',
      deletedAt: '2025-06-01T00:00:00.000Z',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z'
    }
    vi.mocked(creatorRepo.findById).mockReturnValue(deletedCreator)

    await useCase.execute({ url: 'https://youtube.com/watch?v=abc123', creatorName: 'TestCreator' })
    await awaitEnqueuedTask()

    expect(creatorRepo.upsert).not.toHaveBeenCalled()
    expect(creatorRepo.updateStatus).not.toHaveBeenCalled()
  })

  // ── Edge: fetchInfo failure ──

  it('should notify error when fetchInfo fails', async () => {
    vi.mocked(fetchInfo.execute).mockRejectedValue(new Error('Invalid URL'))

    await useCase.execute({ url: 'https://youtube.com/watch?v=abc123', creatorName: 'TestCreator' })
    await awaitEnqueuedTask()

    expect(notifier.notify).toHaveBeenCalledWith(
      'download-progress',
      expect.objectContaining({ status: 'error' })
    )
    expect(downloader.download).not.toHaveBeenCalled()
    expect(videoRepo.upsert).not.toHaveBeenCalled()
  })

  // ── Edge: ensureDirectory failure ──

  it('should notify error when ensureDirectory fails', async () => {
    vi.mocked(fsWriter.ensureDirectory).mockImplementation(() => {
      throw new Error('Permission denied')
    })

    await useCase.execute({ url: 'https://youtube.com/watch?v=abc123', creatorName: 'TestCreator' })
    await awaitEnqueuedTask()

    expect(notifier.notify).toHaveBeenCalledWith(
      'download-progress',
      expect.objectContaining({ status: 'error' })
    )
    expect(downloader.download).not.toHaveBeenCalled()
  })

  // ── Edge: video result with null/missing fields (fallback chain) ──

  it('should use info.title as fallback when result.title is empty', async () => {
    vi.mocked(downloader.download).mockImplementation(async (opts) => ({
      downloadId: opts.downloadId,
      videoId: 'abc123',
      creatorName: 'TestChannel',
      filePath: '/root/TestCreator/downloads/abc123/abc123.mp4',
      title: '', // empty
      duration: null,
      thumbnailPath: null
    }))

    await useCase.execute({ url: 'https://youtube.com/watch?v=abc123', creatorName: 'TestCreator' })
    await awaitEnqueuedTask()

    expect(videoRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Test Video' // falls back to info.title
      })
    )
  })

  it('should use videoId as last-resort title when both result and info are empty', async () => {
    vi.mocked(fetchInfo.execute).mockResolvedValue({
      ...videoInfo,
      title: '' // empty
    })
    vi.mocked(downloader.download).mockImplementation(async (opts) => ({
      downloadId: opts.downloadId,
      videoId: 'abc123',
      creatorName: 'TestChannel',
      filePath: '/root/TestCreator/downloads/abc123/abc123.mp4',
      title: '', // empty
      duration: null,
      thumbnailPath: null
    }))

    await useCase.execute({ url: 'https://youtube.com/watch?v=abc123', creatorName: 'TestCreator' })
    await awaitEnqueuedTask()

    expect(videoRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'abc123' // last fallback
      })
    )
  })

  // ── Edge: concurrent downloads get unique IDs ──

  it('should assign unique downloadIds to concurrent requests', async () => {
    const result1 = await useCase.execute({
      url: 'https://youtube.com/watch?v=vid1',
      creatorName: 'Creator'
    })
    const result2 = await useCase.execute({
      url: 'https://youtube.com/watch?v=vid2',
      creatorName: 'Creator'
    })

    expect(result1.downloadId).not.toBe(result2.downloadId)
  })

  // ── Edge: whitespace-only creator name (after trimming) ──

  it('should throw if creator name is only whitespace', async () => {
    await expect(
      useCase.execute({ url: 'https://youtube.com/watch?v=abc123', creatorName: '   ' })
    ).rejects.toThrow('Creator name is required')
  })

  it('should throw if URL is only whitespace', async () => {
    await expect(useCase.execute({ url: '   ', creatorName: 'TestCreator' })).rejects.toThrow(
      'URL is required'
    )
  })
})
