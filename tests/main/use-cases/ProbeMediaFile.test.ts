import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProbeMediaFile } from '@use-cases/ProbeMediaFile'
import type { IMediaProbe } from '@domain/ports'
import type { MediaProbeResult } from '@domain/types'

// ── Mock builders ──

function mockMediaProbe(overrides: Partial<IMediaProbe> = {}): IMediaProbe {
  return {
    probe: vi.fn(),
    ...overrides
  }
}

describe('ProbeMediaFile', () => {
  let mediaProbe: IMediaProbe
  let useCase: ProbeMediaFile

  beforeEach(() => {
    mediaProbe = mockMediaProbe()
    useCase = new ProbeMediaFile(mediaProbe)
  })

  it('should call mediaProbe.probe with the trimmed file path', async () => {
    const probeResult: MediaProbeResult = {
      duration: 120.5,
      resolution: '1920x1080',
      fileSize: 52428800
    }
    vi.mocked(mediaProbe.probe).mockResolvedValue(probeResult)

    const result = await useCase.execute('  /path/to/video.mp4  ')

    expect(mediaProbe.probe).toHaveBeenCalledWith('/path/to/video.mp4')
    expect(result).toEqual(probeResult)
  })

  it('should throw if file path is empty', async () => {
    await expect(useCase.execute('')).rejects.toThrow('File path is required')
    expect(mediaProbe.probe).not.toHaveBeenCalled()
  })

  it('should throw if file path is only whitespace', async () => {
    await expect(useCase.execute('   ')).rejects.toThrow('File path is required')
    expect(mediaProbe.probe).not.toHaveBeenCalled()
  })

  it('should propagate errors from the media probe', async () => {
    vi.mocked(mediaProbe.probe).mockRejectedValue(new Error('ffprobe not found'))

    await expect(useCase.execute('/path/to/video.mp4')).rejects.toThrow('ffprobe not found')
  })

  it('should handle null fields in probe result', async () => {
    const probeResult: MediaProbeResult = {
      duration: null,
      resolution: null,
      fileSize: null
    }
    vi.mocked(mediaProbe.probe).mockResolvedValue(probeResult)

    const result = await useCase.execute('/path/to/video.mp4')

    expect(result.duration).toBeNull()
    expect(result.resolution).toBeNull()
    expect(result.fileSize).toBeNull()
  })
})
