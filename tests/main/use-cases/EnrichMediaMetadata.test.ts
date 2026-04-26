import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EnrichMediaMetadata } from '@use-cases/EnrichMediaMetadata'
import type { IVideoRepository, ICutRepository } from '@domain/repositories'
import type { IMediaProbe, INotifier } from '@domain/ports'
import type { Video, Cut } from '@domain/entities'
import type { MediaProbeResult } from '@domain/types'

// ── Factory helpers ──

function makeVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: 'video-1',
    creatorId: 'creator-1',
    title: 'video-1',
    url: null,
    duration: null,
    resolution: null,
    fileSize: null,
    filePath: '/root/creator-1/downloads/video-1/video.mp4',
    thumbnailPath: null,
    downloadDate: null,
    probeStatus: 'pending',
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
    filePath: '/root/creator-1/cuts/cut-1/cut.mp4',
    thumbnailPath: null,
    probeStatus: 'pending',
    status: 'active',
    deletedAt: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides
  }
}

const probeResult: MediaProbeResult = {
  duration: 120,
  resolution: '1920x1080',
  fileSize: 50_000_000
}

// ── Mock builders ──

function mockVideoRepo(): IVideoRepository {
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
    findByProbeStatus: vi.fn().mockReturnValue([]),
    upsert: vi.fn(),
    updateStatus: vi.fn(),
    updateProbeStatus: vi.fn(),
    delete: vi.fn(),
    findPaginated: vi.fn()
  }
}

// ── Tests ──

describe('EnrichMediaMetadata', () => {
  let videoRepo: ReturnType<typeof mockVideoRepo>
  let cutRepo: ReturnType<typeof mockCutRepo>
  let mediaProbe: IMediaProbe
  let notifier: INotifier
  let useCase: EnrichMediaMetadata

  beforeEach(() => {
    videoRepo = mockVideoRepo()
    cutRepo = mockCutRepo()
    mediaProbe = {
      probe: vi.fn<[string], Promise<MediaProbeResult>>().mockResolvedValue(probeResult)
    }
    notifier = { notify: vi.fn() }
    useCase = new EnrichMediaMetadata(videoRepo, cutRepo, mediaProbe, notifier)
  })

  it('probes pending videos and updates metadata + probeStatus to complete', async () => {
    const video = makeVideo()
    vi.mocked(videoRepo.findByProbeStatus).mockReturnValue([video])

    const result = await useCase.execute()

    expect(mediaProbe.probe).toHaveBeenCalledWith(video.filePath)
    expect(videoRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'video-1',
        duration: 120,
        resolution: '1920x1080',
        fileSize: 50_000_000,
        probeStatus: 'complete'
      })
    )
    expect(result.videosProbed).toBe(1)
  })

  it('probes pending cuts and updates metadata + probeStatus to complete', async () => {
    const cut = makeCut()
    vi.mocked(cutRepo.findByProbeStatus).mockReturnValue([cut])

    const result = await useCase.execute()

    expect(mediaProbe.probe).toHaveBeenCalledWith(cut.filePath)
    expect(cutRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'cut-1',
        duration: 120,
        resolution: '1920x1080',
        fileSize: 50_000_000,
        probeStatus: 'complete'
      })
    )
    expect(result.cutsProbed).toBe(1)
  })

  it('marks probeStatus as failed when ffprobe throws', async () => {
    const video = makeVideo()
    vi.mocked(videoRepo.findByProbeStatus).mockReturnValue([video])
    vi.mocked(mediaProbe.probe).mockRejectedValue(new Error('ffprobe failed'))

    const result = await useCase.execute()

    expect(videoRepo.updateProbeStatus).toHaveBeenCalledWith('video-1', 'failed')
    expect(videoRepo.upsert).not.toHaveBeenCalled()
    expect(result.failures).toBe(1)
    expect(result.videosProbed).toBe(0)
  })

  it('marks cut probeStatus as failed when ffprobe throws', async () => {
    const cut = makeCut()
    vi.mocked(cutRepo.findByProbeStatus).mockReturnValue([cut])
    vi.mocked(mediaProbe.probe).mockRejectedValue(new Error('ffprobe failed'))

    const result = await useCase.execute()

    expect(cutRepo.updateProbeStatus).toHaveBeenCalledWith('cut-1', 'failed')
    expect(cutRepo.upsert).not.toHaveBeenCalled()
    expect(result.failures).toBe(1)
    expect(result.cutsProbed).toBe(0)
  })

  it('skips non-active entities (status = missing)', async () => {
    const video = makeVideo({ status: 'missing' })
    vi.mocked(videoRepo.findByProbeStatus).mockReturnValue([video])

    const result = await useCase.execute()

    expect(mediaProbe.probe).not.toHaveBeenCalled()
    expect(result.videosProbed).toBe(0)
  })

  it('skips non-active entities (status = deleted)', async () => {
    const cut = makeCut({ status: 'deleted', deletedAt: '2025-06-01' })
    vi.mocked(cutRepo.findByProbeStatus).mockReturnValue([cut])

    const result = await useCase.execute()

    expect(mediaProbe.probe).not.toHaveBeenCalled()
    expect(result.cutsProbed).toBe(0)
  })

  it('sends db-updated notification when at least one entity was probed', async () => {
    const video = makeVideo()
    vi.mocked(videoRepo.findByProbeStatus).mockReturnValue([video])

    await useCase.execute()

    expect(notifier.notify).toHaveBeenCalledWith('db-updated')
  })

  it('does NOT send db-updated when nothing to probe', async () => {
    await useCase.execute()

    expect(notifier.notify).not.toHaveBeenCalled()
  })

  it('returns correct counts in EnrichResult', async () => {
    const v1 = makeVideo({ id: 'v1' })
    const v2 = makeVideo({ id: 'v2' })
    const c1 = makeCut({ id: 'c1' })
    vi.mocked(videoRepo.findByProbeStatus).mockReturnValue([v1, v2])
    vi.mocked(cutRepo.findByProbeStatus).mockReturnValue([c1])

    // v2 fails
    vi.mocked(mediaProbe.probe)
      .mockResolvedValueOnce(probeResult)
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(probeResult)

    const result = await useCase.execute()

    expect(result.videosProbed).toBe(1)
    expect(result.cutsProbed).toBe(1)
    expect(result.failures).toBe(1)
  })

  it('preserves existing metadata when probe returns null values', async () => {
    const video = makeVideo({ duration: 60, resolution: '1280x720', fileSize: 10_000 })
    vi.mocked(videoRepo.findByProbeStatus).mockReturnValue([video])
    vi.mocked(mediaProbe.probe).mockResolvedValue({
      duration: null,
      resolution: null,
      fileSize: null
    })

    await useCase.execute()

    expect(videoRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        duration: 60,
        resolution: '1280x720',
        fileSize: 10_000,
        probeStatus: 'complete'
      })
    )
  })
})
