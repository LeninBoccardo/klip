import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'
import type { ChildProcess } from 'child_process'

// Mock both `child_process` and `fs` *before* importing the SUT so its
// top-level imports pick up the fakes. The fake spawn returns an EventEmitter
// that the test drives manually — emit('close', code) after pushing stdout
// and the wrapped Promise resolves on the next microtask.
const spawnMock = vi.hoisted(() => vi.fn())
const statSyncMock = vi.hoisted(() => vi.fn())

vi.mock('child_process', () => ({ spawn: spawnMock }))
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return { ...actual, statSync: statSyncMock }
})

import { FfprobeMediaProbe } from '@main/framework-drivers/ffprobe/FfprobeMediaProbe'
import type { IBinaryResolver } from '@domain/ports'

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
}

const binaryResolver: IBinaryResolver = {
  resolve: vi.fn().mockReturnValue('/fake/ffprobe')
}

function emitFfprobeRun(stdout: string, code: number, stderr = ''): FakeChildProcess {
  const proc = new FakeChildProcess()
  spawnMock.mockImplementationOnce(() => proc)
  // Defer event emission so `await probe()` has a chance to attach listeners.
  queueMicrotask(() => {
    if (stdout) proc.stdout.emit('data', Buffer.from(stdout))
    if (stderr) proc.stderr.emit('data', Buffer.from(stderr))
    proc.emit('close', code)
  })
  return proc
}

describe('FfprobeMediaProbe', () => {
  let probe: FfprobeMediaProbe

  beforeEach(() => {
    spawnMock.mockReset()
    statSyncMock.mockReset()
    statSyncMock.mockReturnValue({ size: 12345 } as ReturnType<typeof statSyncMock>)
    probe = new FfprobeMediaProbe(binaryResolver)
  })

  it('parses duration and resolution from a well-formed video probe', async () => {
    emitFfprobeRun(
      JSON.stringify({
        format: { duration: '120.5' },
        streams: [{ codec_type: 'audio' }, { codec_type: 'video', width: 1920, height: 1080 }]
      }),
      0
    )

    const result = await probe.probe('C:/file.mp4')
    expect(result).toEqual({
      duration: 120.5,
      resolution: '1920x1080',
      fileSize: 12345
    })
  })

  it('falls back to null resolution when there is no video stream (audio-only)', async () => {
    emitFfprobeRun(
      JSON.stringify({
        format: { duration: '60.0' },
        streams: [{ codec_type: 'audio' }]
      }),
      0
    )

    const result = await probe.probe('C:/audio.m4a')
    expect(result.duration).toBe(60)
    expect(result.resolution).toBeNull()
    expect(result.fileSize).toBe(12345)
  })

  it('returns null resolution when video stream is missing width/height', async () => {
    emitFfprobeRun(
      JSON.stringify({
        format: { duration: '10' },
        streams: [{ codec_type: 'video' }]
      }),
      0
    )

    const result = await probe.probe('C:/weird.mp4')
    expect(result.resolution).toBeNull()
  })

  it('returns null duration when format.duration is missing', async () => {
    emitFfprobeRun(
      JSON.stringify({
        format: {},
        streams: [{ codec_type: 'video', width: 1280, height: 720 }]
      }),
      0
    )

    const result = await probe.probe('C:/no-duration.mp4')
    expect(result.duration).toBeNull()
    expect(result.resolution).toBe('1280x720')
  })

  it('rejects when ffprobe exits non-zero, surfacing the stderr in the message', async () => {
    emitFfprobeRun('', 1, 'Invalid data found when processing input')

    await expect(probe.probe('C:/bad.mp4')).rejects.toThrow(/ffprobe failed \(code 1\)/)
  })

  it('rejects when ffprobe stdout is malformed JSON', async () => {
    emitFfprobeRun('not-json{', 0)

    await expect(probe.probe('C:/bad.mp4')).rejects.toThrow(/failed to parse JSON/)
  })

  it('rejects when the spawn itself errors (binary missing)', async () => {
    const proc = new FakeChildProcess()
    spawnMock.mockImplementationOnce(() => proc as unknown as ChildProcess)
    queueMicrotask(() => proc.emit('error', new Error('ENOENT')))

    await expect(probe.probe('C:/x.mp4')).rejects.toThrow(/Failed to spawn ffprobe/)
  })

  it('still returns a successful probe when statSync throws (size becomes null)', async () => {
    statSyncMock.mockImplementationOnce(() => {
      throw new Error('ENOENT')
    })
    emitFfprobeRun(
      JSON.stringify({
        format: { duration: '5' },
        streams: [{ codec_type: 'video', width: 640, height: 360 }]
      }),
      0
    )

    const result = await probe.probe('C:/missing.mp4')
    expect(result.fileSize).toBeNull()
    expect(result.duration).toBe(5)
    expect(result.resolution).toBe('640x360')
  })

  it('passes the resolved binary path and the file path to spawn', async () => {
    emitFfprobeRun(JSON.stringify({ format: {}, streams: [] }), 0)
    await probe.probe('C:/x.mp4')
    // `-v error` (not `-v quiet`) so ffprobe's own diagnostics reach stderr
    // and surface in the thrown error message when it fails.
    expect(spawnMock).toHaveBeenCalledWith(
      '/fake/ffprobe',
      expect.arrayContaining(['-v', 'error', '-print_format', 'json', 'C:/x.mp4']),
      expect.objectContaining({ stdio: ['ignore', 'pipe', 'pipe'] })
    )
  })
})
