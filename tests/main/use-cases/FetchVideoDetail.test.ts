import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FetchVideoDetail } from '@use-cases/FetchVideoDetail'
import type { IVideoRepository } from '@domain/repositories'
import type { IVideoDownloader, IFileSystemReader, IPathResolver } from '@domain/ports'
import type { Video } from '@domain/entities'

function makeVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: 'video-1',
    creatorId: 'creator-1',
    title: 'Test',
    url: 'https://youtube.com/watch?v=abc',
    duration: 120,
    resolution: '1920x1080',
    fileSize: 1000,
    filePath: '/root/creator-1/downloads/video-1/video.mp4',
    thumbnailPath: null,
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
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides
  }
}

function makeMocks(): {
  videoRepo: IVideoRepository
  downloader: IVideoDownloader
  fsReader: IFileSystemReader
  pathResolver: IPathResolver
} {
  const videoRepo: IVideoRepository = {
    findAll: vi.fn(),
    findAllActive: vi.fn(),
    findById: vi.fn(),
    findByCreatorId: vi.fn(),
    findByProbeStatus: vi.fn(),
    findNeedingDetail: vi.fn().mockReturnValue([]),
    findPaginated: vi.fn(),
    upsert: vi.fn(),
    updateStatus: vi.fn(),
    updateProbeStatus: vi.fn(),
    delete: vi.fn(),
    updateFilePathPrefix: vi.fn()
  }
  const downloader = {
    fetchInfo: vi.fn(),
    fetchChannelInfo: vi.fn(),
    fetchVideoDetail: vi.fn(),
    fetchTranscript: vi.fn(),
    download: vi.fn(),
    cancel: vi.fn()
  } as unknown as IVideoDownloader
  const fsReader: IFileSystemReader = {
    directoryExists: vi.fn(),
    fileExists: vi.fn(),
    listDirectories: vi.fn(),
    listFiles: vi.fn(),
    readJsonFile: vi.fn(),
    readTextFile: vi.fn().mockReturnValue(null)
  }
  const pathResolver: IPathResolver = {
    join: vi.fn((...s) => s.join('/')),
    dirname: vi.fn((p: string) => p.split('/').slice(0, -1).join('/') || '/')
  }
  return { videoRepo, downloader, fsReader, pathResolver }
}

describe('FetchVideoDetail', () => {
  let mocks: ReturnType<typeof makeMocks>
  let useCase: FetchVideoDetail

  beforeEach(() => {
    mocks = makeMocks()
    useCase = new FetchVideoDetail(
      mocks.videoRepo,
      mocks.downloader,
      mocks.fsReader,
      mocks.pathResolver
    )
  })

  it('throws when the video id does not exist', async () => {
    vi.mocked(mocks.videoRepo.findById).mockReturnValue(null)
    await expect(useCase.execute('missing')).rejects.toThrow('Video not found')
  })

  it('throws when the video has no URL', async () => {
    vi.mocked(mocks.videoRepo.findById).mockReturnValue(makeVideo({ url: null }))
    await expect(useCase.execute('video-1')).rejects.toThrow('no URL')
  })

  it('persists detail + transcript and returns parsed transcript text', async () => {
    vi.mocked(mocks.videoRepo.findById).mockReturnValue(makeVideo())
    vi.mocked(mocks.downloader.fetchVideoDetail).mockResolvedValue({
      videoId: 'abc',
      likeCount: 100,
      dislikeCount: null,
      commentCount: 25,
      viewCount: 5000,
      category: 'Music',
      tags: ['rock', 'live'],
      uploadDate: '2024-03-15',
      description: 'A song',
      isShort: false
    })
    vi.mocked(mocks.downloader.fetchTranscript).mockResolvedValue(
      '/root/creator-1/downloads/video-1/transcript.en.vtt'
    )
    vi.mocked(mocks.fsReader.readTextFile).mockReturnValue(
      `WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello world`
    )

    const result = await useCase.execute('video-1')

    expect(result.likeCount).toBe(100)
    expect(result.tags).toEqual(['rock', 'live'])
    expect(result.transcriptText).toBe('Hello world')
    expect(result.hasTranscript).toBe(true)

    expect(mocks.videoRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        likeCount: 100,
        commentCount: 25,
        category: 'Music',
        tags: ['rock', 'live'],
        uploadDate: '2024-03-15',
        isShort: false,
        transcriptPath: '/root/creator-1/downloads/video-1/transcript.en.vtt',
        detailFetchedAt: expect.any(String)
      })
    )
  })

  it('persists detail with null transcript when fetchTranscript returns null', async () => {
    vi.mocked(mocks.videoRepo.findById).mockReturnValue(makeVideo())
    vi.mocked(mocks.downloader.fetchVideoDetail).mockResolvedValue({
      videoId: 'abc',
      likeCount: null,
      dislikeCount: null,
      commentCount: null,
      viewCount: null,
      category: null,
      tags: [],
      uploadDate: null,
      description: null,
      isShort: true
    })
    vi.mocked(mocks.downloader.fetchTranscript).mockResolvedValue(null)

    const result = await useCase.execute('video-1')

    expect(result.transcriptText).toBeNull()
    expect(result.hasTranscript).toBe(false)
    expect(mocks.videoRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        isShort: true,
        transcriptPath: null
      })
    )
  })

  it('still persists detail when transcript fetch throws', async () => {
    vi.mocked(mocks.videoRepo.findById).mockReturnValue(makeVideo())
    vi.mocked(mocks.downloader.fetchVideoDetail).mockResolvedValue({
      videoId: 'abc',
      likeCount: 1,
      dislikeCount: null,
      commentCount: null,
      viewCount: null,
      category: null,
      tags: [],
      uploadDate: null,
      description: null,
      isShort: false
    })
    vi.mocked(mocks.downloader.fetchTranscript).mockRejectedValue(new Error('network'))

    const result = await useCase.execute('video-1')

    expect(result.hasTranscript).toBe(false)
    expect(mocks.videoRepo.upsert).toHaveBeenCalled()
  })
})
