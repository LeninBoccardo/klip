import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IVideoRepository } from '@domain/repositories'
import type { IFileSystemReader } from '@domain/ports'
import type { IFetchVideoDetail } from '@use-cases/IFetchVideoDetail'
import type { IEnrichAllVideos } from '@use-cases/IEnrichAllVideos'

const electron = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
  return {
    handlers,
    ipcMain: {
      handle: vi.fn((channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
        handlers.set(channel, handler)
      }),
      on: vi.fn()
    }
  }
})

vi.mock('electron', () => ({ ipcMain: electron.ipcMain }))

import { registerVideoController } from '@main/interface-adapters/controllers/VideoController'

function makeRepo(): IVideoRepository {
  return {
    findAll: vi.fn(),
    findAllActive: vi.fn(),
    findById: vi.fn().mockReturnValue(null),
    findByCreatorId: vi.fn(),
    findByProbeStatus: vi.fn(),
    findNeedingDetail: vi.fn().mockReturnValue([]),
    findPaginated: vi
      .fn()
      .mockReturnValue({ data: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }),
    upsert: vi.fn(),
    updateStatus: vi.fn(),
    updateProbeStatus: vi.fn(),
    delete: vi.fn(),
    updateFilePathPrefix: vi.fn()
  }
}

function makeDeps(): {
  fetchVideoDetail: IFetchVideoDetail
  enrichAllVideos: IEnrichAllVideos
  fsReader: IFileSystemReader
} {
  return {
    fetchVideoDetail: { execute: vi.fn() },
    enrichAllVideos: { execute: vi.fn() },
    fsReader: {
      directoryExists: vi.fn(),
      fileExists: vi.fn(),
      listDirectories: vi.fn(),
      listFiles: vi.fn(),
      readJsonFile: vi.fn(),
      readTextFile: vi.fn()
    }
  }
}

async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = electron.handlers.get(channel)
  if (!handler) throw new Error(`No handler for "${channel}"`)
  return (await handler({}, ...args)) as T
}

describe('VideoController', () => {
  beforeEach(() => {
    electron.handlers.clear()
    electron.ipcMain.handle.mockClear()
  })

  it('registers all seven video channels', () => {
    const d = makeDeps()
    registerVideoController(makeRepo(), d.fetchVideoDetail, d.enrichAllVideos, d.fsReader)
    expect([...electron.handlers.keys()].sort()).toEqual(
      [
        'delete-video',
        'enrich-all-videos',
        'fetch-video-detail',
        'get-transcript',
        'get-video-by-id',
        'get-videos-paginated',
        'restore-video'
      ].sort()
    )
  })

  it('"get-videos-paginated" forwards params', async () => {
    const repo = makeRepo()
    const d = makeDeps()
    registerVideoController(repo, d.fetchVideoDetail, d.enrichAllVideos, d.fsReader)
    const params = { page: 1, pageSize: 10, creatorId: 'c-1' }
    await invoke('get-videos-paginated', params)
    expect(repo.findPaginated).toHaveBeenCalledWith(params)
  })

  it('"get-video-by-id" forwards id', async () => {
    const repo = makeRepo()
    const d = makeDeps()
    registerVideoController(repo, d.fetchVideoDetail, d.enrichAllVideos, d.fsReader)
    await invoke('get-video-by-id', 'video-1')
    expect(repo.findById).toHaveBeenCalledWith('video-1')
  })

  it('"delete-video" sets status=deleted with timestamp', async () => {
    const repo = makeRepo()
    const d = makeDeps()
    registerVideoController(repo, d.fetchVideoDetail, d.enrichAllVideos, d.fsReader)
    await invoke('delete-video', 'video-1')
    expect(repo.updateStatus).toHaveBeenCalledWith('video-1', 'deleted', expect.any(String))
  })

  it('"restore-video" sets status=active with null deletedAt', async () => {
    const repo = makeRepo()
    const d = makeDeps()
    registerVideoController(repo, d.fetchVideoDetail, d.enrichAllVideos, d.fsReader)
    await invoke('restore-video', 'video-1')
    expect(repo.updateStatus).toHaveBeenCalledWith('video-1', 'active', null)
  })

  it('"fetch-video-detail" delegates to FetchVideoDetail use case', async () => {
    const repo = makeRepo()
    const d = makeDeps()
    vi.mocked(d.fetchVideoDetail.execute).mockResolvedValue({
      videoId: 'v',
      likeCount: 5,
      dislikeCount: null,
      commentCount: null,
      viewCount: null,
      category: null,
      tags: [],
      uploadDate: null,
      description: null,
      isShort: false,
      hasTranscript: false,
      transcriptPath: null,
      transcriptText: null
    })
    registerVideoController(repo, d.fetchVideoDetail, d.enrichAllVideos, d.fsReader)
    const result = await invoke<{ likeCount: number }>('fetch-video-detail', 'video-1')
    expect(d.fetchVideoDetail.execute).toHaveBeenCalledWith('video-1')
    expect(result.likeCount).toBe(5)
  })

  it('"enrich-all-videos" delegates to EnrichAllVideos use case', async () => {
    const repo = makeRepo()
    const d = makeDeps()
    vi.mocked(d.enrichAllVideos.execute).mockResolvedValue({
      total: 3,
      enriched: 2,
      failed: 1,
      skipped: 0
    })
    registerVideoController(repo, d.fetchVideoDetail, d.enrichAllVideos, d.fsReader)
    const result = await invoke<{ enriched: number }>('enrich-all-videos')
    expect(d.enrichAllVideos.execute).toHaveBeenCalled()
    expect(result.enriched).toBe(2)
  })

  it('"get-transcript" returns parsed VTT text when video has transcriptPath', async () => {
    const repo = makeRepo()
    vi.mocked(repo.findById).mockReturnValue({
      id: 'video-1',
      transcriptPath: '/p/transcript.en.vtt'
    } as never)
    const d = makeDeps()
    vi.mocked(d.fsReader.readTextFile).mockReturnValue(
      'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello'
    )
    registerVideoController(repo, d.fetchVideoDetail, d.enrichAllVideos, d.fsReader)
    const result = await invoke('get-transcript', 'video-1')
    expect(result).toBe('Hello')
  })

  it('"get-transcript" returns null when video has no transcriptPath', async () => {
    const repo = makeRepo()
    vi.mocked(repo.findById).mockReturnValue({
      id: 'video-1',
      transcriptPath: null
    } as never)
    const d = makeDeps()
    registerVideoController(repo, d.fetchVideoDetail, d.enrichAllVideos, d.fsReader)
    const result = await invoke('get-transcript', 'video-1')
    expect(result).toBeNull()
    expect(d.fsReader.readTextFile).not.toHaveBeenCalled()
  })
})
