import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RefreshCreatorAvatar } from '@use-cases/RefreshCreatorAvatar'
import type { ICreatorRepository } from '@domain/repositories'
import type { IVideoDownloader, INotifier } from '@domain/ports'
import type { ChannelInfo } from '@domain/types'
import type { Creator } from '@domain/entities'

// ── Mock builders ──

function mockDownloader(): IVideoDownloader {
  return {
    fetchInfo: vi.fn(),
    fetchChannelInfo: vi.fn(),
    fetchVideoDetail: vi.fn(),
    fetchTranscript: vi.fn(),
    fetchComments: vi.fn(),
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
    searchByName: vi.fn().mockReturnValue([]),
    upsert: vi.fn(),
    upsertWithPrevious: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
    findPaginated: vi.fn()
  } as unknown as ICreatorRepository
}

function mockNotifier(): INotifier {
  return { notify: vi.fn() }
}

function makeCreator(overrides: Partial<Creator> = {}): Creator {
  return {
    id: 'test-creator',
    folderName: 'test-creator',
    name: 'Test Creator',
    profileImagePath: null,
    youtubeChannelId: null,
    youtubeChannelUrl: 'https://youtube.com/@testcreator',
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
  avatarUrl: 'https://example.com/avatar.jpg'
}

describe('RefreshCreatorAvatar', () => {
  let downloader: IVideoDownloader
  let creatorRepo: ICreatorRepository
  let notifier: INotifier
  let useCase: RefreshCreatorAvatar

  beforeEach(() => {
    downloader = mockDownloader()
    creatorRepo = mockCreatorRepo()
    notifier = mockNotifier()
    useCase = new RefreshCreatorAvatar(downloader, creatorRepo, notifier)
    vi.mocked(downloader.fetchChannelInfo).mockResolvedValue(channelInfo)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Early-return guards ──

  it('returns { refreshed: false } when the creator does not exist', async () => {
    vi.mocked(creatorRepo.findById).mockReturnValue(null)

    const result = await useCase.execute('missing-id')

    expect(result).toEqual({ refreshed: false })
    expect(creatorRepo.findById).toHaveBeenCalledWith('missing-id')
    expect(downloader.fetchChannelInfo).not.toHaveBeenCalled()
    expect(creatorRepo.upsert).not.toHaveBeenCalled()
    expect(notifier.notify).not.toHaveBeenCalled()
  })

  it('skips when the creator already has a local profileImagePath', async () => {
    vi.mocked(creatorRepo.findById).mockReturnValue(
      makeCreator({ profileImagePath: '/local/avatar.png' })
    )

    const result = await useCase.execute('test-creator')

    expect(result).toEqual({ refreshed: false })
    expect(downloader.fetchChannelInfo).not.toHaveBeenCalled()
    expect(creatorRepo.upsert).not.toHaveBeenCalled()
    expect(notifier.notify).not.toHaveBeenCalled()
  })

  it('skips when the creator already has a remote avatarUrl', async () => {
    vi.mocked(creatorRepo.findById).mockReturnValue(
      makeCreator({ avatarUrl: 'https://example.com/existing.jpg' })
    )

    const result = await useCase.execute('test-creator')

    expect(result).toEqual({ refreshed: false })
    expect(downloader.fetchChannelInfo).not.toHaveBeenCalled()
    expect(creatorRepo.upsert).not.toHaveBeenCalled()
    expect(notifier.notify).not.toHaveBeenCalled()
  })

  it('skips when the creator has no youtubeChannelUrl (null)', async () => {
    vi.mocked(creatorRepo.findById).mockReturnValue(
      makeCreator({ youtubeChannelUrl: null })
    )

    const result = await useCase.execute('test-creator')

    expect(result).toEqual({ refreshed: false })
    expect(downloader.fetchChannelInfo).not.toHaveBeenCalled()
    expect(creatorRepo.upsert).not.toHaveBeenCalled()
    expect(notifier.notify).not.toHaveBeenCalled()
  })

  it('skips when the creator has an empty-string youtubeChannelUrl (falsy)', async () => {
    vi.mocked(creatorRepo.findById).mockReturnValue(
      makeCreator({ youtubeChannelUrl: '' })
    )

    const result = await useCase.execute('test-creator')

    expect(result).toEqual({ refreshed: false })
    expect(downloader.fetchChannelInfo).not.toHaveBeenCalled()
  })

  // ── yt-dlp returned no usable thumbnail ──

  it('returns { refreshed: false } when yt-dlp returns a null avatarUrl', async () => {
    vi.mocked(creatorRepo.findById).mockReturnValue(makeCreator())
    vi.mocked(downloader.fetchChannelInfo).mockResolvedValue({
      ...channelInfo,
      avatarUrl: null
    })

    const result = await useCase.execute('test-creator')

    expect(result).toEqual({ refreshed: false })
    expect(downloader.fetchChannelInfo).toHaveBeenCalledWith('https://youtube.com/@testcreator')
    expect(creatorRepo.upsert).not.toHaveBeenCalled()
    expect(notifier.notify).not.toHaveBeenCalled()
  })

  it('treats an undefined avatarUrl from yt-dlp as no thumbnail (?? null coalesce)', async () => {
    vi.mocked(creatorRepo.findById).mockReturnValue(makeCreator())
    // Simulate a downloader whose payload omits avatarUrl entirely.
    vi.mocked(downloader.fetchChannelInfo).mockResolvedValue({
      channelId: 'UC_abc123',
      channelName: 'Test Creator',
      channelUrl: null,
      uploaderUrl: null,
      subscriberCount: null
    } as unknown as ChannelInfo)

    const result = await useCase.execute('test-creator')

    expect(result).toEqual({ refreshed: false })
    expect(creatorRepo.upsert).not.toHaveBeenCalled()
    expect(notifier.notify).not.toHaveBeenCalled()
  })

  // ── Happy path ──

  it('persists the fetched avatar, updates subscriberCount, and broadcasts db-updated', async () => {
    const existing = makeCreator()
    vi.mocked(creatorRepo.findById).mockReturnValue(existing)

    const result = await useCase.execute('test-creator')

    expect(result).toEqual({ refreshed: true })
    expect(creatorRepo.upsert).toHaveBeenCalledTimes(1)
    expect(creatorRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'test-creator',
        folderName: 'test-creator',
        avatarUrl: 'https://example.com/avatar.jpg',
        subscriberCount: 50000
      })
    )
    expect(notifier.notify).toHaveBeenCalledTimes(1)
    expect(notifier.notify).toHaveBeenCalledWith('db-updated', { scope: ['creators'] })
  })

  it('refreshes the updatedAt timestamp on upsert', async () => {
    const existing = makeCreator({ updatedAt: '2025-01-01T00:00:00.000Z' })
    vi.mocked(creatorRepo.findById).mockReturnValue(existing)
    vi.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-06-17T12:00:00.000Z')

    await useCase.execute('test-creator')

    const persisted = vi.mocked(creatorRepo.upsert).mock.calls[0][0]
    expect(persisted.updatedAt).toBe('2026-06-17T12:00:00.000Z')
  })

  it('preserves the existing subscriberCount when yt-dlp returns a null count', async () => {
    const existing = makeCreator({ subscriberCount: 12345 })
    vi.mocked(creatorRepo.findById).mockReturnValue(existing)
    vi.mocked(downloader.fetchChannelInfo).mockResolvedValue({
      ...channelInfo,
      subscriberCount: null
    })

    await useCase.execute('test-creator')

    const persisted = vi.mocked(creatorRepo.upsert).mock.calls[0][0]
    expect(persisted.subscriberCount).toBe(12345)
    expect(persisted.avatarUrl).toBe('https://example.com/avatar.jpg')
  })

  it('preserves a null existing subscriberCount when yt-dlp also returns null', async () => {
    const existing = makeCreator({ subscriberCount: null })
    vi.mocked(creatorRepo.findById).mockReturnValue(existing)
    vi.mocked(downloader.fetchChannelInfo).mockResolvedValue({
      ...channelInfo,
      subscriberCount: null
    })

    await useCase.execute('test-creator')

    const persisted = vi.mocked(creatorRepo.upsert).mock.calls[0][0]
    expect(persisted.subscriberCount).toBeNull()
  })

  it('spreads the existing creator so untouched fields survive the upsert', async () => {
    const existing = makeCreator({
      name: 'Original Name',
      notes: 'keep me',
      tags: ['a', 'b'],
      youtubeChannelId: 'UC_keep'
    })
    vi.mocked(creatorRepo.findById).mockReturnValue(existing)

    await useCase.execute('test-creator')

    const persisted = vi.mocked(creatorRepo.upsert).mock.calls[0][0]
    expect(persisted.name).toBe('Original Name')
    expect(persisted.notes).toBe('keep me')
    expect(persisted.tags).toEqual(['a', 'b'])
    expect(persisted.youtubeChannelId).toBe('UC_keep')
  })

  // ── Error / rejection path (never throws) ──

  it('swallows a yt-dlp rejection, logs a warning, and returns { refreshed: false }', async () => {
    const existing = makeCreator({ folderName: 'broken-creator' })
    vi.mocked(creatorRepo.findById).mockReturnValue(existing)
    const failure = new Error('yt-dlp exited non-zero')
    vi.mocked(downloader.fetchChannelInfo).mockRejectedValue(failure)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await useCase.execute('test-creator')

    expect(result).toEqual({ refreshed: false })
    expect(creatorRepo.upsert).not.toHaveBeenCalled()
    expect(notifier.notify).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toMatch(/RefreshCreatorAvatar.*broken-creator/)
    // The Error.message must travel into the log for diagnosis.
    expect(warnSpy.mock.calls[0][1]).toBe('yt-dlp exited non-zero')
  })

  it('logs the raw value when the rejection is not an Error instance', async () => {
    const existing = makeCreator()
    vi.mocked(creatorRepo.findById).mockReturnValue(existing)
    vi.mocked(downloader.fetchChannelInfo).mockRejectedValue('string failure')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await useCase.execute('test-creator')

    expect(result).toEqual({ refreshed: false })
    // The non-Error branch of `err instanceof Error ? err.message : err`.
    expect(warnSpy.mock.calls[0][1]).toBe('string failure')
  })

  it('swallows an error thrown by the repository upsert and returns { refreshed: false }', async () => {
    const existing = makeCreator()
    vi.mocked(creatorRepo.findById).mockReturnValue(existing)
    vi.mocked(creatorRepo.upsert).mockImplementation(() => {
      throw new Error('db write failed')
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await useCase.execute('test-creator')

    expect(result).toEqual({ refreshed: false })
    // upsert threw, so notify should never run.
    expect(notifier.notify).not.toHaveBeenCalled()
    expect(warnSpy.mock.calls[0][1]).toBe('db write failed')
  })
})
