import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SearchAll } from '@use-cases/SearchAll'
import type { ICreatorRepository, IVideoRepository, ICutRepository } from '@domain/repositories'
import type { IGetAllDistinctTags } from '@use-cases/IGetAllDistinctTags'
import type { Creator, Video, Cut } from '@domain/entities'

// ── factories ──

function makeCreator(overrides: Partial<Creator> = {}): Creator {
  return {
    id: 'c-1',
    folderName: 'c-1',
    name: 'Creator',
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
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides
  }
}

function makeVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: 'v-1',
    creatorId: 'c-1',
    title: 'Video',
    url: null,
    duration: null,
    resolution: null,
    fileSize: null,
    filePath: '/x/v.mp4',
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

function makeCut(overrides: Partial<Cut> = {}): Cut {
  return {
    id: 'cut-1',
    creatorId: 'c-1',
    videoId: null,
    title: 'Cut',
    tags: [],
    startTimestamp: null,
    endTimestamp: null,
    duration: null,
    resolution: null,
    fileSize: null,
    filePath: '/x/c.mp4',
    thumbnailPath: null,
    probeStatus: 'complete',
    status: 'active',
    deletedAt: null,
    editRecipeJson: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides
  }
}

describe('SearchAll', () => {
  let creatorRepo: ICreatorRepository
  let videoRepo: IVideoRepository
  let cutRepo: ICutRepository
  let tagsUseCase: IGetAllDistinctTags
  let useCase: SearchAll

  beforeEach(() => {
    creatorRepo = {
      findAll: vi.fn(),
      findAllActive: vi.fn(),
      findById: vi.fn(),
      findByFolderName: vi.fn(),
      findByYoutubeChannelId: vi.fn(),
      searchByName: vi.fn().mockReturnValue([]),
      upsert: vi.fn(),
      upsertWithPrevious: vi.fn(),
      updateStatus: vi.fn(),
      delete: vi.fn(),
      findPaginated: vi.fn()
    }
    videoRepo = {
      findAll: vi.fn(),
      findAllActive: vi.fn(),
      findById: vi.fn(),
      findByCreatorId: vi.fn(),
      findByProbeStatus: vi.fn(),
      findNeedingDetail: vi.fn(),
      findMissingForRecovery: vi.fn().mockReturnValue([]),
      findByTags: vi.fn(),
      searchByTitle: vi.fn().mockReturnValue([]),
      getAllDistinctTags: vi.fn(),
      findPaginated: vi.fn(),
      upsert: vi.fn(),
      upsertWithPrevious: vi.fn(),
      updateStatus: vi.fn(),
      updateProbeStatus: vi.fn(),
      delete: vi.fn(),
      updateFilePathPrefix: vi.fn()
    }
    cutRepo = {
      findAll: vi.fn(),
      findAllActive: vi.fn(),
      findById: vi.fn(),
      findByCreatorId: vi.fn(),
      findByVideoId: vi.fn(),
      findByTags: vi.fn(),
      searchByTitle: vi.fn().mockReturnValue([]),
      getAllDistinctTags: vi.fn(),
      findByProbeStatus: vi.fn(),
      findPaginated: vi.fn(),
      upsert: vi.fn(),
      upsertWithPrevious: vi.fn(),
      updateStatus: vi.fn(),
      updateProbeStatus: vi.fn(),
      delete: vi.fn(),
      updateFilePathPrefix: vi.fn()
    }
    tagsUseCase = { execute: vi.fn().mockReturnValue([]) }
    useCase = new SearchAll(creatorRepo, videoRepo, cutRepo, tagsUseCase)
  })

  it('returns empty groups for an empty / whitespace query without hitting repos', () => {
    expect(useCase.execute('')).toEqual({ creators: [], videos: [], cuts: [], tags: [] })
    expect(useCase.execute('   ')).toEqual({ creators: [], videos: [], cuts: [], tags: [] })

    expect(creatorRepo.searchByName).not.toHaveBeenCalled()
    expect(videoRepo.searchByTitle).not.toHaveBeenCalled()
    expect(cutRepo.searchByTitle).not.toHaveBeenCalled()
    expect(tagsUseCase.execute).not.toHaveBeenCalled()
  })

  it('passes the trimmed query and clamped limit to each surface', () => {
    useCase.execute('  cats  ', 5)

    expect(creatorRepo.searchByName).toHaveBeenCalledWith('cats', 5)
    expect(videoRepo.searchByTitle).toHaveBeenCalledWith('cats', 5)
    expect(cutRepo.searchByTitle).toHaveBeenCalledWith('cats', 5)
  })

  it('clamps an oversize limit to the maximum (50)', () => {
    useCase.execute('cats', 9999)

    expect(creatorRepo.searchByName).toHaveBeenCalledWith('cats', 50)
    expect(videoRepo.searchByTitle).toHaveBeenCalledWith('cats', 50)
    expect(cutRepo.searchByTitle).toHaveBeenCalledWith('cats', 50)
  })

  it('clamps a zero/negative/NaN limit to 1', () => {
    useCase.execute('cats', 0)
    expect(creatorRepo.searchByName).toHaveBeenLastCalledWith('cats', 1)

    useCase.execute('cats', -3)
    expect(creatorRepo.searchByName).toHaveBeenLastCalledWith('cats', 1)

    useCase.execute('cats', Number.NaN)
    expect(creatorRepo.searchByName).toHaveBeenLastCalledWith('cats', 1)
  })

  it('uses a default limit of 8 when none is passed', () => {
    useCase.execute('cats')
    expect(creatorRepo.searchByName).toHaveBeenCalledWith('cats', 8)
  })

  it('maps domain entities to DTOs (drops filesystem paths)', () => {
    vi.mocked(creatorRepo.searchByName).mockReturnValue([
      makeCreator({ id: 'c-1', name: 'Pet World', profileImagePath: '/abs/avatar.jpg' })
    ])
    vi.mocked(videoRepo.searchByTitle).mockReturnValue([
      makeVideo({
        id: 'v-1',
        title: 'Cat compilation',
        thumbnailPath: '/abs/thumb.jpg',
        transcriptPath: '/abs/t.vtt'
      })
    ])
    vi.mocked(cutRepo.searchByTitle).mockReturnValue([
      makeCut({ id: 'cut-1', title: 'Best cat moment', thumbnailPath: '/abs/c-thumb.jpg' })
    ])

    const result = useCase.execute('cat', 5)

    expect(result.creators).toHaveLength(1)
    expect(result.creators[0]).toMatchObject({ id: 'c-1', hasLocalAvatar: true })
    expect(result.creators[0]).not.toHaveProperty('profileImagePath')

    expect(result.videos).toHaveLength(1)
    expect(result.videos[0]).toMatchObject({ id: 'v-1', hasThumbnail: true, hasTranscript: true })
    expect(result.videos[0]).not.toHaveProperty('filePath')
    expect(result.videos[0]).not.toHaveProperty('thumbnailPath')

    expect(result.cuts).toHaveLength(1)
    expect(result.cuts[0]).toMatchObject({ id: 'cut-1', hasThumbnail: true })
    expect(result.cuts[0]).not.toHaveProperty('filePath')
  })

  it('filters tags by case-insensitive substring and caps to limit', () => {
    vi.mocked(tagsUseCase.execute).mockReturnValue([
      { tag: 'music', videoCount: 3, cutCount: 0 },
      { tag: 'live music', videoCount: 1, cutCount: 2 },
      { tag: 'mixtape', videoCount: 0, cutCount: 1 },
      { tag: 'unrelated', videoCount: 5, cutCount: 0 }
    ])

    const result = useCase.execute('MUS', 2)

    // First two matches preserve the upstream ordering (already sorted by total
    // count desc by GetAllDistinctTags); cap at 2 so 'mixtape' is dropped.
    expect(result.tags.map((t) => t.tag)).toEqual(['music', 'live music'])
  })
})
