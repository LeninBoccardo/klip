import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ICreatorRepository, IVideoRepository, ICutRepository } from '@domain/repositories'
import type { Creator, Video, Cut } from '@domain/entities'
import { ResolveMediaUrl } from '@main/use-cases/ResolveMediaUrl'

function makeCreator(overrides: Partial<Creator> = {}): Creator {
  return {
    id: 'creator-1',
    folderName: 'creator-1',
    name: 'Creator One',
    profileImagePath: '/root/creator-1/profile.jpg',
    youtubeChannelId: null,
    youtubeChannelUrl: null,
    subscriberCount: null,
    avatarUrl: null,
    notes: null,
    tags: [],
    status: 'active',
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

function makeVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: 'video-1',
    creatorId: 'creator-1',
    title: 'Video',
    url: null,
    duration: null,
    resolution: null,
    fileSize: null,
    filePath: '/root/creator-1/downloads/video-1/video-1.mp4',
    thumbnailPath: '/root/creator-1/downloads/video-1/video-1.jpg',
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
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

function makeCut(overrides: Partial<Cut> = {}): Cut {
  return {
    id: 'cut-1',
    creatorId: 'creator-1',
    videoId: null,
    title: 'Cut',
    tags: [],
    startTimestamp: null,
    endTimestamp: null,
    duration: null,
    resolution: null,
    fileSize: null,
    filePath: '/root/creator-1/cuts/cut-1/cut.mp4',
    thumbnailPath: '/root/creator-1/cuts/cut-1/cut.png',
    probeStatus: 'complete',
    status: 'active',
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

function makeRepos(): {
  creatorRepo: ICreatorRepository
  videoRepo: IVideoRepository
  cutRepo: ICutRepository
} {
  return {
    creatorRepo: {
      findAll: vi.fn(),
      findAllActive: vi.fn(),
      findById: vi.fn().mockReturnValue(null),
      findByFolderName: vi.fn(),
      findByYoutubeChannelId: vi.fn(),
      upsert: vi.fn(),
      upsertWithPrevious: vi.fn(),
      updateStatus: vi.fn(),
      delete: vi.fn(),
      findPaginated: vi.fn()
    },
    videoRepo: {
      findAll: vi.fn(),
      findAllActive: vi.fn(),
      findById: vi.fn().mockReturnValue(null),
      findByCreatorId: vi.fn(),
      findByProbeStatus: vi.fn(),
      findNeedingDetail: vi.fn(),
      upsert: vi.fn(),
      upsertWithPrevious: vi.fn(),
      updateStatus: vi.fn(),
      updateProbeStatus: vi.fn(),
      delete: vi.fn(),
      findPaginated: vi.fn(),
      updateFilePathPrefix: vi.fn()
    },
    cutRepo: {
      findAll: vi.fn(),
      findAllActive: vi.fn(),
      findById: vi.fn().mockReturnValue(null),
      findByCreatorId: vi.fn(),
      findByVideoId: vi.fn(),
      findByTags: vi.fn(),
      findByProbeStatus: vi.fn(),
      upsert: vi.fn(),
      upsertWithPrevious: vi.fn(),
      updateStatus: vi.fn(),
      updateProbeStatus: vi.fn(),
      delete: vi.fn(),
      findPaginated: vi.fn(),
      updateFilePathPrefix: vi.fn()
    }
  }
}

describe('ResolveMediaUrl', () => {
  let repos: ReturnType<typeof makeRepos>
  let useCase: ResolveMediaUrl

  beforeEach(() => {
    repos = makeRepos()
    useCase = new ResolveMediaUrl(repos.creatorRepo, repos.videoRepo, repos.cutRepo)
  })

  describe('video kind', () => {
    it('resolves video/file to the videos.filePath', () => {
      vi.mocked(repos.videoRepo.findById).mockReturnValue(makeVideo())
      const result = useCase.resolve({ kind: 'video', id: 'video-1', asset: 'file' })
      expect(result).toBe('/root/creator-1/downloads/video-1/video-1.mp4')
      expect(repos.videoRepo.findById).toHaveBeenCalledWith('video-1')
    })

    it('resolves video/thumbnail to the videos.thumbnailPath', () => {
      vi.mocked(repos.videoRepo.findById).mockReturnValue(makeVideo())
      const result = useCase.resolve({ kind: 'video', id: 'video-1', asset: 'thumbnail' })
      expect(result).toBe('/root/creator-1/downloads/video-1/video-1.jpg')
    })

    it('returns null when the video has no thumbnail', () => {
      vi.mocked(repos.videoRepo.findById).mockReturnValue(makeVideo({ thumbnailPath: null }))
      const result = useCase.resolve({ kind: 'video', id: 'video-1', asset: 'thumbnail' })
      expect(result).toBeNull()
    })

    it('returns null when the video does not exist', () => {
      vi.mocked(repos.videoRepo.findById).mockReturnValue(null)
      const result = useCase.resolve({ kind: 'video', id: 'unknown', asset: 'file' })
      expect(result).toBeNull()
    })

    it('returns null for invalid asset (avatar)', () => {
      vi.mocked(repos.videoRepo.findById).mockReturnValue(makeVideo())
      const result = useCase.resolve({ kind: 'video', id: 'video-1', asset: 'avatar' })
      expect(result).toBeNull()
    })
  })

  describe('cut kind', () => {
    it('resolves cut/file to the cuts.filePath', () => {
      vi.mocked(repos.cutRepo.findById).mockReturnValue(makeCut())
      const result = useCase.resolve({ kind: 'cut', id: 'cut-1', asset: 'file' })
      expect(result).toBe('/root/creator-1/cuts/cut-1/cut.mp4')
    })

    it('resolves cut/thumbnail to the cuts.thumbnailPath', () => {
      vi.mocked(repos.cutRepo.findById).mockReturnValue(makeCut())
      const result = useCase.resolve({ kind: 'cut', id: 'cut-1', asset: 'thumbnail' })
      expect(result).toBe('/root/creator-1/cuts/cut-1/cut.png')
    })

    it('returns null when the cut has no thumbnail', () => {
      vi.mocked(repos.cutRepo.findById).mockReturnValue(makeCut({ thumbnailPath: null }))
      const result = useCase.resolve({ kind: 'cut', id: 'cut-1', asset: 'thumbnail' })
      expect(result).toBeNull()
    })

    it('returns null when the cut does not exist', () => {
      vi.mocked(repos.cutRepo.findById).mockReturnValue(null)
      const result = useCase.resolve({ kind: 'cut', id: 'unknown', asset: 'file' })
      expect(result).toBeNull()
    })

    it('returns null for invalid asset (avatar)', () => {
      vi.mocked(repos.cutRepo.findById).mockReturnValue(makeCut())
      const result = useCase.resolve({ kind: 'cut', id: 'cut-1', asset: 'avatar' })
      expect(result).toBeNull()
    })
  })

  describe('creator kind', () => {
    it('resolves creator/avatar to the creators.profileImagePath', () => {
      vi.mocked(repos.creatorRepo.findById).mockReturnValue(makeCreator())
      const result = useCase.resolve({ kind: 'creator', id: 'creator-1', asset: 'avatar' })
      expect(result).toBe('/root/creator-1/profile.jpg')
    })

    it('returns null when the creator has no local avatar', () => {
      vi.mocked(repos.creatorRepo.findById).mockReturnValue(makeCreator({ profileImagePath: null }))
      const result = useCase.resolve({ kind: 'creator', id: 'creator-1', asset: 'avatar' })
      expect(result).toBeNull()
    })

    it('returns null when the creator does not exist', () => {
      vi.mocked(repos.creatorRepo.findById).mockReturnValue(null)
      const result = useCase.resolve({ kind: 'creator', id: 'unknown', asset: 'avatar' })
      expect(result).toBeNull()
    })

    it('returns null for invalid asset (file)', () => {
      vi.mocked(repos.creatorRepo.findById).mockReturnValue(makeCreator())
      const result = useCase.resolve({ kind: 'creator', id: 'creator-1', asset: 'file' })
      expect(result).toBeNull()
    })

    it('returns null for invalid asset (thumbnail)', () => {
      vi.mocked(repos.creatorRepo.findById).mockReturnValue(makeCreator())
      const result = useCase.resolve({ kind: 'creator', id: 'creator-1', asset: 'thumbnail' })
      expect(result).toBeNull()
    })
  })
})
