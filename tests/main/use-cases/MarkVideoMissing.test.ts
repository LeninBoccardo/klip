import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MarkVideoMissing } from '@main/use-cases/MarkVideoMissing'
import type { IVideoRepository } from '@domain/repositories'
import type { INotifier } from '@domain/ports'
import type { Video } from '@domain/entities'

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

describe('MarkVideoMissing', () => {
  let videoRepo: IVideoRepository
  let notifier: INotifier
  let useCase: MarkVideoMissing

  beforeEach(() => {
    videoRepo = {
      findById: vi.fn(),
      updateStatus: vi.fn()
    } as unknown as IVideoRepository
    notifier = { notify: vi.fn() } as unknown as INotifier
    useCase = new MarkVideoMissing(videoRepo, notifier)
  })

  it('flips an active video to missing and notifies db-updated', () => {
    vi.mocked(videoRepo.findById).mockReturnValue(makeVideo({ status: 'active' }))

    useCase.execute('v-1', 'unavailable')

    expect(videoRepo.updateStatus).toHaveBeenCalledWith('v-1', 'missing', null)
    expect(notifier.notify).toHaveBeenCalledWith('db-updated', { scope: ['videos'] })
  })

  it('is idempotent — a second call on a missing video is a no-op', () => {
    vi.mocked(videoRepo.findById).mockReturnValue(makeVideo({ status: 'missing' }))

    useCase.execute('v-1', 'unauthorized')

    expect(videoRepo.updateStatus).not.toHaveBeenCalled()
    expect(notifier.notify).not.toHaveBeenCalled()
  })

  it('returns silently when the video is not found', () => {
    vi.mocked(videoRepo.findById).mockReturnValue(null)

    useCase.execute('ghost', 'unavailable')

    expect(videoRepo.updateStatus).not.toHaveBeenCalled()
    expect(notifier.notify).not.toHaveBeenCalled()
  })

  it('accepts both unavailable and unauthorized reasons', () => {
    vi.mocked(videoRepo.findById).mockReturnValue(makeVideo({ status: 'active' }))

    useCase.execute('v-1', 'unauthorized')
    expect(videoRepo.updateStatus).toHaveBeenCalledWith('v-1', 'missing', null)
  })
})
