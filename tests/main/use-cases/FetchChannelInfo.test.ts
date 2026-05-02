import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FetchChannelInfo } from '@use-cases/FetchChannelInfo'
import type { ICreatorRepository } from '@domain/repositories'
import type { IVideoDownloader } from '@domain/ports'
import type { ChannelInfo } from '@domain/types'
import type { Creator } from '@domain/entities'

// ── Mock builders ──

function mockDownloader(): IVideoDownloader {
  return {
    fetchInfo: vi.fn(),
    fetchChannelInfo: vi.fn(),
    download: vi.fn(),
    cancel: vi.fn()
  }
}

function mockCreatorRepo(): ICreatorRepository {
  return {
    findAll: vi.fn().mockReturnValue([]),
    findAllActive: vi.fn().mockReturnValue([]),
    findById: vi.fn().mockReturnValue(null),
    findByFolderName: vi.fn().mockReturnValue(null),
    findByYoutubeChannelId: vi.fn().mockReturnValue(null),
    upsert: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
    findPaginated: vi.fn()
  }
}

function makeCreator(overrides: Partial<Creator> = {}): Creator {
  return {
    id: 'test-creator',
    folderName: 'test-creator',
    name: 'Test Creator',
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

const channelInfo: ChannelInfo = {
  channelId: 'UC_abc123',
  channelName: 'Test Creator',
  channelUrl: 'https://youtube.com/channel/UC_abc123',
  uploaderUrl: 'https://youtube.com/@testcreator',
  subscriberCount: 50000,
  avatarUrl: null
}

describe('FetchChannelInfo', () => {
  let downloader: IVideoDownloader
  let creatorRepo: ICreatorRepository
  let useCase: FetchChannelInfo

  beforeEach(() => {
    downloader = mockDownloader()
    creatorRepo = mockCreatorRepo()
    useCase = new FetchChannelInfo(downloader, creatorRepo)
    vi.mocked(downloader.fetchChannelInfo).mockResolvedValue(channelInfo)
  })

  it('returns channel info when no Creator match exists', async () => {
    const result = await useCase.execute('https://youtube.com/@testcreator')

    expect(result.channelInfo).toEqual(channelInfo)
    expect(result.creatorId).toBeNull()
    expect(result.updated).toBe(false)
    expect(creatorRepo.upsert).not.toHaveBeenCalled()
  })

  it('matches Creator by youtubeChannelId and upserts metadata', async () => {
    const existing = makeCreator({ youtubeChannelId: 'UC_abc123' })
    vi.mocked(creatorRepo.findByYoutubeChannelId).mockReturnValue(existing)

    const result = await useCase.execute('https://youtube.com/@testcreator')

    expect(result.creatorId).toBe('test-creator')
    expect(result.updated).toBe(true)
    expect(creatorRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        youtubeChannelId: 'UC_abc123',
        youtubeChannelUrl: 'https://youtube.com/channel/UC_abc123',
        subscriberCount: 50000
      })
    )
  })

  it('falls back to slugify(channelName) → findByFolderName when channelId has no match', async () => {
    vi.mocked(creatorRepo.findByYoutubeChannelId).mockReturnValue(null)
    const existing = makeCreator({ folderName: 'test-creator' })
    vi.mocked(creatorRepo.findByFolderName).mockReturnValue(existing)

    const result = await useCase.execute('https://youtube.com/@testcreator')

    expect(creatorRepo.findByFolderName).toHaveBeenCalledWith('test-creator')
    expect(result.creatorId).toBe('test-creator')
    expect(result.updated).toBe(true)
  })

  it('does not overwrite existing non-null Creator fields with null', async () => {
    const existing = makeCreator({
      youtubeChannelId: 'UC_abc123',
      subscriberCount: 99999,
      avatarUrl: 'https://example.com/avatar.jpg'
    })
    vi.mocked(creatorRepo.findByYoutubeChannelId).mockReturnValue(existing)

    const infoWithNulls: ChannelInfo = {
      ...channelInfo,
      subscriberCount: null,
      avatarUrl: null
    }
    vi.mocked(downloader.fetchChannelInfo).mockResolvedValue(infoWithNulls)

    await useCase.execute('https://youtube.com/@testcreator')

    expect(creatorRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriberCount: 99999, // preserved
        avatarUrl: 'https://example.com/avatar.jpg' // preserved
      })
    )
  })

  it('throws if URL is empty', async () => {
    await expect(useCase.execute('')).rejects.toThrow('URL is required')
  })

  it('throws if URL is only whitespace', async () => {
    await expect(useCase.execute('   ')).rejects.toThrow('URL is required')
  })

  it('returns updated: true when Creator was modified', async () => {
    const existing = makeCreator()
    vi.mocked(creatorRepo.findByFolderName).mockReturnValue(existing)

    const result = await useCase.execute('https://youtube.com/@testcreator')

    expect(result.updated).toBe(true)
  })
})
