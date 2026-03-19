import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FetchVideoInfo } from '@use-cases/FetchVideoInfo'
import type { IVideoDownloader } from '@domain/ports'
import type { VideoInfo } from '@domain/types'

// ── Mock builder ──

function mockDownloader(overrides: Partial<IVideoDownloader> = {}): IVideoDownloader {
  return {
    fetchInfo: vi.fn(),
    download: vi.fn(),
    cancel: vi.fn(),
    ...overrides
  }
}

describe('FetchVideoInfo', () => {
  let downloader: IVideoDownloader
  let useCase: FetchVideoInfo

  beforeEach(() => {
    downloader = mockDownloader()
    useCase = new FetchVideoInfo(downloader)
  })

  it('should call downloader.fetchInfo with the trimmed URL', async () => {
    const info: VideoInfo = {
      videoId: 'abc123',
      title: 'Test Video',
      channel: 'TestChannel',
      duration: 120,
      thumbnailUrl: 'https://example.com/thumb.jpg',
      description: 'A test video'
    }
    vi.mocked(downloader.fetchInfo).mockResolvedValue(info)

    const result = await useCase.execute('  https://youtube.com/watch?v=abc123  ')

    expect(downloader.fetchInfo).toHaveBeenCalledWith('https://youtube.com/watch?v=abc123')
    expect(result).toEqual(info)
  })

  it('should throw if URL is empty', async () => {
    await expect(useCase.execute('')).rejects.toThrow('URL is required')
    expect(downloader.fetchInfo).not.toHaveBeenCalled()
  })

  it('should throw if URL is only whitespace', async () => {
    await expect(useCase.execute('   ')).rejects.toThrow('URL is required')
    expect(downloader.fetchInfo).not.toHaveBeenCalled()
  })

  it('should propagate errors from the downloader', async () => {
    vi.mocked(downloader.fetchInfo).mockRejectedValue(new Error('Network error'))

    await expect(useCase.execute('https://youtube.com/watch?v=abc123')).rejects.toThrow(
      'Network error'
    )
  })
})
