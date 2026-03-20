import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DownloadVideo } from '@use-cases/DownloadVideo'
import type { ICreatorRepository, IVideoRepository } from '@domain/repositories'
import type {
  IVideoDownloader,
  IDownloadQueue,
  IPathResolver,
  IFileSystemWriter,
  INotifier
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
    upsert: vi.fn(),
    updateStatus: vi.fn(),
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

    expect(creatorRepo.findById).toHaveBeenCalledWith('TestCreator')
    expect(creatorRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'TestCreator',
        name: 'TestCreator',
        status: 'active'
      })
    )
  })

  it('should recover a missing creator instead of creating a new one', async () => {
    const missingCreator: Creator = {
      id: 'TestCreator',
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

    expect(creatorRepo.updateStatus).toHaveBeenCalledWith('TestCreator', 'active', null)
    expect(creatorRepo.upsert).not.toHaveBeenCalled()
  })

  it('should create the output directory', async () => {
    await useCase.execute({ url: 'https://youtube.com/watch?v=abc123', creatorName: 'TestCreator' })
    await awaitEnqueuedTask()
    expect(fsWriter.ensureDirectory).toHaveBeenCalledWith('/root/TestCreator/downloads/abc123')
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
        outputDir: '/root/TestCreator/downloads/abc123',
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
        creatorId: 'TestCreator',
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
})
