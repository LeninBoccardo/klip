import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RetryDownload } from '@use-cases/RetryDownload'
import type { ICreatorRepository, IDownloadHistoryRepository } from '@domain/repositories'
import type { IDownloadVideo } from '@use-cases/IDownloadVideo'
import type { DownloadHistoryEntry, Creator } from '@domain/entities'

// ── Mock builders ──

function mockHistoryRepo(
  overrides: Partial<IDownloadHistoryRepository> = {}
): IDownloadHistoryRepository {
  return {
    append: vi.fn(),
    findRecent: vi.fn().mockReturnValue([]),
    findById: vi.fn().mockReturnValue(null),
    deleteOlderThan: vi.fn().mockReturnValue(0),
    ...overrides
  }
}

function mockCreatorRepo(overrides: Partial<ICreatorRepository> = {}): ICreatorRepository {
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
    findPaginated: vi.fn(),
    count: vi.fn().mockReturnValue(0),
    countByStatus: vi.fn().mockReturnValue({}),
    findNamesByIds: vi.fn().mockReturnValue(new Map()),
    ...overrides
  }
}

function mockDownloadVideo(overrides: Partial<IDownloadVideo> = {}): IDownloadVideo {
  return {
    execute: vi.fn().mockResolvedValue({ downloadId: 'new-dl-id' }),
    cancel: vi.fn(),
    ...overrides
  }
}

// ── Test data ──

function makeEntry(overrides: Partial<DownloadHistoryEntry> = {}): DownloadHistoryEntry {
  return {
    id: 'hist-1',
    youtubeUrl: 'https://youtube.com/watch?v=abc123',
    videoId: null,
    videoTitle: null,
    thumbnailUrl: null,
    creatorFolderName: 'testcreator',
    status: 'error',
    errorMessage: 'Network failure',
    errorRetryable: true,
    finishedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

function makeCreator(overrides: Partial<Creator> = {}): Creator {
  return {
    id: 'creator-uuid',
    folderName: 'testcreator',
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

// ── Tests ──

describe('RetryDownload', () => {
  let historyRepo: IDownloadHistoryRepository
  let creatorRepo: ICreatorRepository
  let downloadVideo: IDownloadVideo
  let useCase: RetryDownload

  beforeEach(() => {
    historyRepo = mockHistoryRepo()
    creatorRepo = mockCreatorRepo()
    downloadVideo = mockDownloadVideo()
    useCase = new RetryDownload(historyRepo, creatorRepo, downloadVideo)
  })

  it('throws when the history entry is not found', async () => {
    vi.mocked(historyRepo.findById).mockReturnValue(null)

    await expect(useCase.execute('missing-id')).rejects.toThrow(
      'Download history entry not found: missing-id'
    )
    expect(historyRepo.findById).toHaveBeenCalledWith('missing-id')
    expect(downloadVideo.execute).not.toHaveBeenCalled()
  })

  it('throws when the attempt already succeeded', async () => {
    vi.mocked(historyRepo.findById).mockReturnValue(
      makeEntry({ status: 'success', videoId: 'abc123', errorRetryable: true })
    )

    await expect(useCase.execute('hist-1')).rejects.toThrow(
      'Cannot retry: this attempt already succeeded.'
    )
    expect(downloadVideo.execute).not.toHaveBeenCalled()
    expect(creatorRepo.findByFolderName).not.toHaveBeenCalled()
  })

  it('throws when the failure is marked non-retryable', async () => {
    vi.mocked(historyRepo.findById).mockReturnValue(
      makeEntry({ status: 'error', errorRetryable: false })
    )

    await expect(useCase.execute('hist-1')).rejects.toThrow(
      'Cannot retry: this failure is marked non-retryable.'
    )
    expect(downloadVideo.execute).not.toHaveBeenCalled()
    expect(creatorRepo.findByFolderName).not.toHaveBeenCalled()
  })

  it('resolves the creator display name via findByFolderName and delegates to DownloadVideo', async () => {
    vi.mocked(historyRepo.findById).mockReturnValue(makeEntry({ creatorFolderName: 'testcreator' }))
    vi.mocked(creatorRepo.findByFolderName).mockReturnValue(
      makeCreator({ folderName: 'testcreator', name: 'Test Creator' })
    )

    const result = await useCase.execute('hist-1')

    expect(creatorRepo.findByFolderName).toHaveBeenCalledWith('testcreator')
    // Hands the resolved display name (not the folder slug) to DownloadVideo,
    // which re-slugs it internally.
    expect(downloadVideo.execute).toHaveBeenCalledWith({
      url: 'https://youtube.com/watch?v=abc123',
      creatorName: 'Test Creator'
    })
    expect(result).toEqual({ downloadId: 'new-dl-id' })
  })

  it('falls back to the captured folder name verbatim when no creator row matches', async () => {
    // The folder lookup misses (creator deleted from DB but history row
    // survives) — retry must still proceed using the slug rather than
    // registering a different creator.
    vi.mocked(historyRepo.findById).mockReturnValue(makeEntry({ creatorFolderName: 'orphanslug' }))
    vi.mocked(creatorRepo.findByFolderName).mockReturnValue(null)

    const result = await useCase.execute('hist-1')

    expect(creatorRepo.findByFolderName).toHaveBeenCalledWith('orphanslug')
    expect(downloadVideo.execute).toHaveBeenCalledWith({
      url: 'https://youtube.com/watch?v=abc123',
      creatorName: 'orphanslug'
    })
    expect(result).toEqual({ downloadId: 'new-dl-id' })
  })

  it('throws when the original creator cannot be resolved (folderName is null)', async () => {
    vi.mocked(historyRepo.findById).mockReturnValue(makeEntry({ creatorFolderName: null }))

    await expect(useCase.execute('hist-1')).rejects.toThrow(
      'Cannot retry: original creator could not be resolved.'
    )
    // folderName null → the lookup is skipped entirely.
    expect(creatorRepo.findByFolderName).not.toHaveBeenCalled()
    expect(downloadVideo.execute).not.toHaveBeenCalled()
  })

  it('throws when the captured folder name is an empty string', async () => {
    // Empty string is falsy: it skips both the lookup and the fallback,
    // landing on the unresolved-creator guard.
    vi.mocked(historyRepo.findById).mockReturnValue(makeEntry({ creatorFolderName: '' }))

    await expect(useCase.execute('hist-1')).rejects.toThrow(
      'Cannot retry: original creator could not be resolved.'
    )
    expect(creatorRepo.findByFolderName).not.toHaveBeenCalled()
    expect(downloadVideo.execute).not.toHaveBeenCalled()
  })

  it('propagates a rejection from the downstream DownloadVideo use case', async () => {
    vi.mocked(historyRepo.findById).mockReturnValue(makeEntry())
    vi.mocked(creatorRepo.findByFolderName).mockReturnValue(makeCreator())
    vi.mocked(downloadVideo.execute).mockRejectedValue(new Error('queue full'))

    await expect(useCase.execute('hist-1')).rejects.toThrow('queue full')
  })

  it('passes the original youtubeUrl through unchanged', async () => {
    vi.mocked(historyRepo.findById).mockReturnValue(
      makeEntry({
        youtubeUrl: 'https://youtube.com/watch?v=zzz999',
        creatorFolderName: 'someslug'
      })
    )
    vi.mocked(creatorRepo.findByFolderName).mockReturnValue(
      makeCreator({ folderName: 'someslug', name: 'Some Creator' })
    )

    await useCase.execute('hist-1')

    expect(downloadVideo.execute).toHaveBeenCalledWith({
      url: 'https://youtube.com/watch?v=zzz999',
      creatorName: 'Some Creator'
    })
  })
})
