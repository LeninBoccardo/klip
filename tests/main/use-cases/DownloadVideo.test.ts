import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DownloadVideo } from '@use-cases/DownloadVideo'
import type { ICreatorRepository, IVideoRepository } from '@domain/repositories'
import type {
  IVideoDownloader,
  IDownloadQueue,
  IPathResolver,
  IFileSystemReader,
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
    fetchChannelInfo: vi.fn(),
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
    findByYoutubeChannelId: vi.fn().mockReturnValue(null),
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
    findByYoutubeVideoId: vi.fn().mockReturnValue(null),
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

function mockFsReader(overrides: Partial<IFileSystemReader> = {}): IFileSystemReader {
  return {
    directoryExists: vi.fn().mockReturnValue(true),
    fileExists: vi.fn().mockReturnValue(false),
    listDirectories: vi.fn().mockReturnValue([]),
    listFiles: vi.fn().mockReturnValue([]),
    readJsonFile: vi.fn().mockReturnValue(null),
    readTextFile: vi.fn().mockReturnValue(null),
    ...overrides
  } as IFileSystemReader
}

function mockPathResolver(): IPathResolver {
  return {
    join: vi.fn((...segments: string[]) => segments.join('/')),
    dirname: vi.fn((p: string) => p.split('/').slice(0, -1).join('/') || '/')
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
  description: 'A test video',
  channelId: null,
  channelUrl: null,
  uploaderUrl: null,
  subscriberCount: null,
  viewCount: null
}

const downloadResult: DownloadResult = {
  downloadId: 'will-be-overwritten',
  videoId: 'abc123',
  creatorName: 'TestChannel',
  filePath: '/root/TestCreator/downloads/abc123/abc123.mp4',
  title: 'Test Video',
  duration: 120,
  thumbnailPath: '/root/TestCreator/downloads/abc123/abc123.jpg',
  channelId: null,
  channelUrl: null,
  subscriberCount: null,
  viewCount: null
}

// ── Tests ──

describe('DownloadVideo', () => {
  let downloader: IVideoDownloader
  let fetchInfo: IFetchVideoInfo
  let downloadQueue: ReturnType<typeof mockDownloadQueue>
  let creatorRepo: ICreatorRepository
  let videoRepo: IVideoRepository
  let pathResolver: IPathResolver
  let fsReader: IFileSystemReader
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
    fsReader = mockFsReader()
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
      fsReader,
      fsWriter,
      notifier,
      idGenerator,
      { value: ROOT }
    )
  })

  it('returns a downloadId and threads it through the queued notification + downloader call', async () => {
    // Without these stronger assertions, a regression that returned one id
    // to the caller but passed a different id to the downloader (or to the
    // 'queued' progress event) would slip past — the cancel button keys off
    // the returned id, so divergence orphans the cancel API.
    await useCase.execute({
      url: 'https://youtube.com/watch?v=abc123',
      creatorName: 'TestCreator'
    })
    await awaitEnqueuedTask()

    // 'queued' progress event captures the id the renderer will track.
    const queuedCall = vi
      .mocked(notifier.notify)
      .mock.calls.find(
        ([ch, payload]) =>
          ch === 'download-progress' && (payload as DownloadProgress).status === 'queued'
      )
    expect(queuedCall).toBeDefined()
    const queuedId = (queuedCall![1] as DownloadProgress).downloadId

    // The downloader must be invoked with the same id (cancel() keys off it).
    expect(downloader.download).toHaveBeenCalledWith(
      expect.objectContaining({ downloadId: queuedId }),
      expect.any(Function)
    )
  })

  it('returns the same downloadId to the caller as the one passed to the downloader', async () => {
    const result = await useCase.execute({
      url: 'https://youtube.com/watch?v=abc123',
      creatorName: 'TestCreator'
    })
    await awaitEnqueuedTask()

    expect(result.downloadId).toBeDefined()
    expect(typeof result.downloadId).toBe('string')
    expect(downloader.download).toHaveBeenCalledWith(
      expect.objectContaining({ downloadId: result.downloadId }),
      expect.any(Function)
    )
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

  it('should recover a missing creator (status → active) and backfill metadata', async () => {
    const missingCreator: Creator = {
      id: 'testcreator',
      folderName: 'testcreator',
      name: 'TestCreator',
      profileImagePath: null,
      youtubeChannelId: null,
      youtubeChannelUrl: null,
      subscriberCount: null,
      avatarUrl: null,
      notes: null,
      tags: [],
      status: 'missing',
      deletedAt: '2025-01-02T00:00:00.000Z',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z'
    }
    vi.mocked(creatorRepo.findById).mockReturnValue(missingCreator)

    await useCase.execute({ url: 'https://youtube.com/watch?v=abc123', creatorName: 'TestCreator' })
    await awaitEnqueuedTask()

    // Single upsert that flips status to active AND clears deletedAt — no
    // separate updateStatus call. (Backfill merges any newly-available YT
    // channel metadata at the same time.)
    expect(creatorRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'testcreator',
        status: 'active',
        deletedAt: null
      })
    )
    expect(creatorRepo.updateStatus).not.toHaveBeenCalled()
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
    expect(notifier.notify).toHaveBeenCalledWith('db-updated', {
      scope: ['creators', 'videos']
    })
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

  it('emits a terminal error event when the queue rejects before the task runs', async () => {
    // Simulate a queue that rejects without ever invoking the task (e.g.
    // shutdown clearing pending tasks). The use case must still notify the
    // renderer so the UI doesn't sit in `queued` indefinitely.
    const queueErr = new Error('queue cleared during shutdown')
    const rejectingQueue: IDownloadQueue = {
      enqueue: vi.fn().mockRejectedValue(queueErr),
      pending: vi.fn().mockReturnValue(0),
      running: vi.fn().mockReturnValue(0),
      onIdle: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn()
    }
    useCase = new DownloadVideo(
      downloader,
      fetchInfo,
      rejectingQueue,
      creatorRepo,
      videoRepo,
      pathResolver,
      fsReader,
      fsWriter,
      notifier,
      idGenerator,
      { value: ROOT }
    )

    const result = await useCase.execute({
      url: 'https://youtube.com/watch?v=abc123',
      creatorName: 'TestCreator'
    })
    // Allow the .catch handler to run.
    await new Promise((resolve) => setImmediate(resolve))

    expect(rejectingQueue.enqueue).toHaveBeenCalledTimes(1)
    expect(downloader.download).not.toHaveBeenCalled()
    expect(notifier.notify).toHaveBeenCalledWith(
      'download-progress',
      expect.objectContaining({
        downloadId: result.downloadId,
        url: 'https://youtube.com/watch?v=abc123',
        status: 'error'
      })
    )
  })

  it('should not notify error when download throws the cancellation sentinel', async () => {
    // The suppression contract inside performDownload keys on the exact
    // string `Error('Download cancelled')` — the driver throws this when
    // SIGTERM lands on yt-dlp. A regression that changes the sentinel (or
    // the equality check) would re-emit a spurious 'error' progress event
    // to the UI.
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

  it('still emits the error progress event when the rejection is NOT the cancel sentinel', async () => {
    // Negative-control for the suppression: any other error message must
    // surface to the UI. Without this guard, the previous test would pass
    // even if the suppression catch-all swallowed every error.
    vi.mocked(downloader.download).mockRejectedValue(new Error('Network unreachable'))

    await useCase.execute({ url: 'https://youtube.com/watch?v=abc123', creatorName: 'TestCreator' })
    await awaitEnqueuedTask()

    const errorCalls = vi
      .mocked(notifier.notify)
      .mock.calls.filter(
        (c) => c[0] === 'download-progress' && (c[1] as DownloadProgress)?.status === 'error'
      )
    expect(errorCalls.length).toBeGreaterThan(0)
  })

  it('exposes a cancel() method that delegates to the downloader port', () => {
    // The public cancel API — distinct from the in-flight suppression logic
    // above. Hooked up via DownloadController; if this delegation breaks,
    // the cancel button in the UI silently no-ops.
    useCase.cancel('dl-abc')
    expect(downloader.cancel).toHaveBeenCalledWith('dl-abc')
  })

  // ── Edge: existing active creator (no upsert/updateStatus needed) ──

  it('should not upsert or updateStatus for an existing active creator', async () => {
    const activeCreator: Creator = {
      id: 'testcreator',
      folderName: 'testcreator',
      name: 'TestCreator',
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
      youtubeChannelId: null,
      youtubeChannelUrl: null,
      subscriberCount: null,
      avatarUrl: null,
      notes: null,
      tags: [],
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
      thumbnailPath: null,
      channelId: null,
      channelUrl: null,
      subscriberCount: null,
      viewCount: null
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
      thumbnailPath: null,
      channelId: null,
      channelUrl: null,
      subscriberCount: null,
      viewCount: null
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

  // ── videoId allowlist (defense against tampered yt-dlp output) ──

  it('should reject videoIds containing path-traversal characters before reaching disk', async () => {
    vi.mocked(fetchInfo.execute).mockResolvedValue({
      ...videoInfo,
      videoId: '../../../etc/passwd'
    })

    await useCase.execute({ url: 'https://youtube.com/watch?v=abc123', creatorName: 'TestCreator' })
    await awaitEnqueuedTask()

    // Output dir creation must NOT happen — we never reach `pathResolver.join`.
    expect(fsWriter.ensureDirectory).not.toHaveBeenCalled()
    expect(downloader.download).not.toHaveBeenCalled()
    // Error path emits a download-progress event with status='error' (caught
    // inside performDownload), so the failure surfaces to the renderer.
    expect(notifier.notify).toHaveBeenCalledWith(
      'download-progress',
      expect.objectContaining({ status: 'error' })
    )
  })

  it('should reject videoIds with slashes', async () => {
    vi.mocked(fetchInfo.execute).mockResolvedValue({
      ...videoInfo,
      videoId: 'evil/id'
    })

    await useCase.execute({ url: 'https://youtube.com/watch?v=abc123', creatorName: 'TestCreator' })
    await awaitEnqueuedTask()

    expect(fsWriter.ensureDirectory).not.toHaveBeenCalled()
    expect(downloader.download).not.toHaveBeenCalled()
  })

  // ── YouTube metadata enrichment on ensureCreator ──

  it('should set YouTube metadata on a new Creator when info.channelId is provided', async () => {
    const infoWithChannel: VideoInfo = {
      ...videoInfo,
      channelId: 'UC_x5XG1OV2P6uZZ5FSM9Ttw',
      channelUrl: 'https://youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw',
      subscriberCount: 50000
    }
    vi.mocked(fetchInfo.execute).mockResolvedValue(infoWithChannel)

    await useCase.execute({ url: 'https://youtube.com/watch?v=abc123', creatorName: 'TestCreator' })
    await awaitEnqueuedTask()

    expect(creatorRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        youtubeChannelId: 'UC_x5XG1OV2P6uZZ5FSM9Ttw',
        youtubeChannelUrl: 'https://youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw',
        subscriberCount: 50000
      })
    )
  })

  it('should backfill YouTube metadata on existing active creator that lacks youtubeChannelId', async () => {
    const activeCreator: Creator = {
      id: 'testcreator',
      folderName: 'testcreator',
      name: 'TestCreator',
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
      updatedAt: '2025-01-01T00:00:00.000Z'
    }
    vi.mocked(creatorRepo.findById).mockReturnValue(activeCreator)

    const infoWithChannel: VideoInfo = {
      ...videoInfo,
      channelId: 'UC_backfill',
      channelUrl: 'https://youtube.com/channel/UC_backfill',
      subscriberCount: 1000
    }
    vi.mocked(fetchInfo.execute).mockResolvedValue(infoWithChannel)

    await useCase.execute({ url: 'https://youtube.com/watch?v=abc123', creatorName: 'TestCreator' })
    await awaitEnqueuedTask()

    expect(creatorRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        youtubeChannelId: 'UC_backfill',
        youtubeChannelUrl: 'https://youtube.com/channel/UC_backfill',
        subscriberCount: 1000
      })
    )
  })

  // ── Dedupe (Item 20) ──

  function makeExistingVideo(
    overrides: Partial<import('@domain/entities').Video> = {}
  ): import('@domain/entities').Video {
    return {
      id: 'abc123',
      creatorId: 'TestCreator',
      title: 'Existing Video',
      url: 'https://youtube.com/watch?v=abc123',
      duration: 120,
      resolution: null,
      fileSize: null,
      filePath: '/root/TestCreator/downloads/abc123/abc123.mp4',
      thumbnailPath: null,
      downloadDate: '2025-01-01T00:00:00.000Z',
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
      transcriptText: null,
      detailFetchedAt: null,
      status: 'active',
      deletedAt: null,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      ...overrides
    }
  }

  it('skips an active video already in the library and emits duplicate progress', async () => {
    vi.mocked(videoRepo.findByYoutubeVideoId).mockReturnValue(makeExistingVideo())
    vi.mocked(fsReader.fileExists).mockReturnValue(true)

    await useCase.execute({
      url: 'https://youtube.com/watch?v=abc123',
      creatorName: 'TestCreator'
    })
    await awaitEnqueuedTask()

    expect(downloader.download).not.toHaveBeenCalled()
    expect(videoRepo.upsert).not.toHaveBeenCalled()
    expect(notifier.notify).toHaveBeenCalledWith(
      'download-progress',
      expect.objectContaining({
        status: 'duplicate',
        existingVideoId: 'abc123',
        title: 'Existing Video'
      })
    )
  })

  it('proceeds with download when the existing video is missing (recovery path)', async () => {
    vi.mocked(videoRepo.findByYoutubeVideoId).mockReturnValue(
      makeExistingVideo({ status: 'missing' })
    )
    vi.mocked(fsReader.fileExists).mockReturnValue(true)

    await useCase.execute({
      url: 'https://youtube.com/watch?v=abc123',
      creatorName: 'TestCreator'
    })
    await awaitEnqueuedTask()

    expect(downloader.download).toHaveBeenCalled()
    expect(videoRepo.upsert).toHaveBeenCalled()
    expect(notifier.notify).not.toHaveBeenCalledWith(
      'download-progress',
      expect.objectContaining({ status: 'duplicate' })
    )
  })

  it('proceeds with download when the file is gone from disk', async () => {
    vi.mocked(videoRepo.findByYoutubeVideoId).mockReturnValue(makeExistingVideo())
    vi.mocked(fsReader.fileExists).mockReturnValue(false)

    await useCase.execute({
      url: 'https://youtube.com/watch?v=abc123',
      creatorName: 'TestCreator'
    })
    await awaitEnqueuedTask()

    expect(downloader.download).toHaveBeenCalled()
    expect(notifier.notify).not.toHaveBeenCalledWith(
      'download-progress',
      expect.objectContaining({ status: 'duplicate' })
    )
  })

  it('proceeds with download when the existing video is deleted', async () => {
    vi.mocked(videoRepo.findByYoutubeVideoId).mockReturnValue(
      makeExistingVideo({ status: 'deleted' })
    )
    vi.mocked(fsReader.fileExists).mockReturnValue(true)

    await useCase.execute({
      url: 'https://youtube.com/watch?v=abc123',
      creatorName: 'TestCreator'
    })
    await awaitEnqueuedTask()

    expect(downloader.download).toHaveBeenCalled()
  })

  it('should NOT overwrite existing youtubeChannelId on a Creator', async () => {
    const linkedCreator: Creator = {
      id: 'testcreator',
      folderName: 'testcreator',
      name: 'TestCreator',
      profileImagePath: null,
      youtubeChannelId: 'UC_already_linked',
      youtubeChannelUrl: 'https://youtube.com/channel/UC_already_linked',
      subscriberCount: 9999,
      avatarUrl: null,
      notes: null,
      tags: [],
      status: 'active',
      deletedAt: null,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z'
    }
    vi.mocked(creatorRepo.findById).mockReturnValue(linkedCreator)

    const infoWithDifferentChannel: VideoInfo = {
      ...videoInfo,
      channelId: 'UC_different',
      channelUrl: 'https://youtube.com/channel/UC_different',
      subscriberCount: 500
    }
    vi.mocked(fetchInfo.execute).mockResolvedValue(infoWithDifferentChannel)

    await useCase.execute({ url: 'https://youtube.com/watch?v=abc123', creatorName: 'TestCreator' })
    await awaitEnqueuedTask()

    // Should NOT upsert because existing.youtubeChannelId is already set
    expect(creatorRepo.upsert).not.toHaveBeenCalled()
    expect(creatorRepo.updateStatus).not.toHaveBeenCalled()
  })
})
