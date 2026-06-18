import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ListDownloadHistory } from '@main/use-cases/ListDownloadHistory'
import type { IDownloadHistoryRepository, IVideoRepository } from '@domain/repositories'
import type { DownloadHistoryEntry, Video } from '@domain/entities'

function makeEntry(overrides: Partial<DownloadHistoryEntry> = {}): DownloadHistoryEntry {
  return {
    id: 'h-1',
    youtubeUrl: 'https://youtube.com/watch?v=abc',
    videoId: 'v-1',
    videoTitle: 'Test',
    thumbnailUrl: null,
    creatorFolderName: 'creator',
    status: 'success',
    errorMessage: null,
    errorRetryable: false,
    finishedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

function makeVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: 'v-1',
    creatorId: 'c-1',
    title: 'Test',
    url: 'https://youtube.com/watch?v=abc',
    duration: null,
    resolution: null,
    fileSize: null,
    filePath: '/root/c-1/downloads/v-1/v.mp4',
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
    transcriptText: null,
    detailFetchedAt: null,
    status: 'active',
    deletedAt: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides
  }
}

describe('ListDownloadHistory', () => {
  let historyRepo: IDownloadHistoryRepository
  let videoRepo: IVideoRepository
  let useCase: ListDownloadHistory

  beforeEach(() => {
    historyRepo = {
      append: vi.fn(),
      findRecent: vi.fn(),
      findById: vi.fn()
    } as unknown as IDownloadHistoryRepository
    videoRepo = {
      findById: vi.fn()
    } as unknown as IVideoRepository
    useCase = new ListDownloadHistory(historyRepo, videoRepo)
  })

  it('forwards the limit to historyRepo.findRecent', () => {
    vi.mocked(historyRepo.findRecent).mockReturnValue([])

    useCase.execute(25)

    expect(historyRepo.findRecent).toHaveBeenCalledWith(25)
    expect(historyRepo.findRecent).toHaveBeenCalledTimes(1)
  })

  it('returns an empty array when the repo yields no rows', () => {
    vi.mocked(historyRepo.findRecent).mockReturnValue([])

    expect(useCase.execute(10)).toEqual([])
    // No video lookups needed when there is nothing to filter.
    expect(videoRepo.findById).not.toHaveBeenCalled()
  })

  it('keeps error rows unconditionally without consulting the video repo', () => {
    const errorRow = makeEntry({ id: 'err', status: 'error', videoId: null })
    vi.mocked(historyRepo.findRecent).mockReturnValue([errorRow])

    const result = useCase.execute(10)

    expect(result).toEqual([errorRow])
    // Error short-circuits before the videoId / findById branches.
    expect(videoRepo.findById).not.toHaveBeenCalled()
  })

  it('keeps an error row even when it carries a videoId, never looking up the video', () => {
    const errorRow = makeEntry({ id: 'err-with-vid', status: 'error', videoId: 'v-1' })
    vi.mocked(historyRepo.findRecent).mockReturnValue([errorRow])

    const result = useCase.execute(10)

    expect(result).toEqual([errorRow])
    expect(videoRepo.findById).not.toHaveBeenCalled()
  })

  it('drops a success row whose videoId is null', () => {
    const orphan = makeEntry({ id: 'orphan', status: 'success', videoId: null })
    vi.mocked(historyRepo.findRecent).mockReturnValue([orphan])

    const result = useCase.execute(10)

    expect(result).toEqual([])
    // videoId === null short-circuits before findById.
    expect(videoRepo.findById).not.toHaveBeenCalled()
  })

  it('keeps a success row whose video exists and is active', () => {
    const row = makeEntry({ id: 'ok', status: 'success', videoId: 'v-1' })
    vi.mocked(historyRepo.findRecent).mockReturnValue([row])
    vi.mocked(videoRepo.findById).mockReturnValue(makeVideo({ id: 'v-1', status: 'active' }))

    const result = useCase.execute(10)

    expect(result).toEqual([row])
    expect(videoRepo.findById).toHaveBeenCalledWith('v-1')
  })

  it('keeps a success row whose video is in a non-deleted, non-active status (e.g. missing)', () => {
    const row = makeEntry({ id: 'missing-vid', status: 'success', videoId: 'v-2' })
    vi.mocked(historyRepo.findRecent).mockReturnValue([row])
    vi.mocked(videoRepo.findById).mockReturnValue(makeVideo({ id: 'v-2', status: 'missing' }))

    const result = useCase.execute(10)

    expect(result).toEqual([row])
  })

  it('drops a success row whose video has been hard-deleted (findById returns null)', () => {
    const row = makeEntry({ id: 'gone', status: 'success', videoId: 'v-3' })
    vi.mocked(historyRepo.findRecent).mockReturnValue([row])
    vi.mocked(videoRepo.findById).mockReturnValue(null)

    const result = useCase.execute(10)

    expect(result).toEqual([])
    expect(videoRepo.findById).toHaveBeenCalledWith('v-3')
  })

  it('drops a success row whose video is soft-deleted (status === deleted)', () => {
    const row = makeEntry({ id: 'tombstone', status: 'success', videoId: 'v-4' })
    vi.mocked(historyRepo.findRecent).mockReturnValue([row])
    vi.mocked(videoRepo.findById).mockReturnValue(makeVideo({ id: 'v-4', status: 'deleted' }))

    const result = useCase.execute(10)

    expect(result).toEqual([])
  })

  it('filters a mixed batch, preserving order and applying every rule', () => {
    const keptError = makeEntry({ id: 'a', status: 'error', videoId: null })
    const droppedOrphan = makeEntry({ id: 'b', status: 'success', videoId: null })
    const keptActive = makeEntry({ id: 'c', status: 'success', videoId: 'v-active' })
    const droppedHardDeleted = makeEntry({ id: 'd', status: 'success', videoId: 'v-gone' })
    const droppedSoftDeleted = makeEntry({ id: 'e', status: 'success', videoId: 'v-soft' })
    const keptMissing = makeEntry({ id: 'f', status: 'success', videoId: 'v-missing' })

    vi.mocked(historyRepo.findRecent).mockReturnValue([
      keptError,
      droppedOrphan,
      keptActive,
      droppedHardDeleted,
      droppedSoftDeleted,
      keptMissing
    ])
    vi.mocked(videoRepo.findById).mockImplementation((id: string) => {
      if (id === 'v-active') return makeVideo({ id, status: 'active' })
      if (id === 'v-soft') return makeVideo({ id, status: 'deleted' })
      if (id === 'v-missing') return makeVideo({ id, status: 'missing' })
      return null // v-gone
    })

    const result = useCase.execute(50)

    expect(result.map((r) => r.id)).toEqual(['a', 'c', 'f'])
    // Called once per success row with a non-null videoId: v-active, v-gone,
    // v-soft, v-missing. The error row and the null-videoId row short-circuit.
    expect(videoRepo.findById).toHaveBeenCalledTimes(4)
  })
})
