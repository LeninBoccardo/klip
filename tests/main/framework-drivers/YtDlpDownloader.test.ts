import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

// Mock child_process before importing the SUT so its top-level import binds the
// fake spawn. The fake proc is an EventEmitter the test drives manually.
const spawnMock = vi.hoisted(() => vi.fn())
vi.mock('child_process', () => ({ spawn: spawnMock }))

import { YtDlpDownloader } from '@main/framework-drivers/yt-dlp/YtDlpDownloader'
import type { IBinaryResolver } from '@domain/ports'

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  kill = vi.fn()
}

const binaryResolver: IBinaryResolver = {
  resolve: vi.fn().mockReturnValue('/fake/yt-dlp')
}

/** Queue a successful run: emit stdout then close(0) on the next microtask. */
function emitRun(stdout: string, code = 0, stderr = ''): FakeChildProcess {
  const proc = new FakeChildProcess()
  spawnMock.mockImplementationOnce(() => proc)
  queueMicrotask(() => {
    if (stdout) proc.stdout.emit('data', Buffer.from(stdout))
    if (stderr) proc.stderr.emit('data', Buffer.from(stderr))
    proc.emit('close', code)
  })
  return proc
}

describe('YtDlpDownloader', () => {
  let downloader: YtDlpDownloader

  beforeEach(() => {
    spawnMock.mockReset()
    downloader = new YtDlpDownloader(binaryResolver)
  })

  it('fetchInfo parses yt-dlp JSON into a VideoInfo', async () => {
    emitRun(
      JSON.stringify({
        id: 'abc123',
        title: 'Hello',
        channel: 'Chan',
        duration: 42,
        channel_id: 'UC_x',
        view_count: 7
      })
    )

    const info = await downloader.fetchInfo('https://youtube.com/watch?v=abc123')
    expect(info).toMatchObject({
      videoId: 'abc123',
      title: 'Hello',
      channel: 'Chan',
      duration: 42,
      channelId: 'UC_x',
      viewCount: 7
    })
  })

  it('fetchInfo rejects on a non-zero exit code', async () => {
    emitRun('', 1, 'boom')
    await expect(downloader.fetchInfo('https://youtube.com/watch?v=x')).rejects.toThrow(
      /fetchInfo failed \(code 1\)/
    )
  })

  it('fetchInfo rejects and SIGTERMs the child when yt-dlp never settles (F09 timeout)', async () => {
    vi.useFakeTimers()
    try {
      const proc = new FakeChildProcess()
      spawnMock.mockImplementationOnce(() => proc)

      const assertion = expect(
        downloader.fetchInfo('https://youtube.com/watch?v=hang')
      ).rejects.toThrow(/timed out/)
      // Advance past the 90s metadata cap — the child never emits 'close'.
      await vi.advanceTimersByTimeAsync(90_000)
      await assertion
      expect(proc.kill).toHaveBeenCalledWith('SIGTERM')
    } finally {
      vi.useRealTimers()
    }
  })
})
