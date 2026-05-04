import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAllWindows = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: mockGetAllWindows }
}))

import { ElectronNotifier } from '@main/framework-drivers/electron/ElectronNotifier'

interface FakeWindow {
  webContents: { send: ReturnType<typeof vi.fn> }
}

function makeWin(): FakeWindow {
  return { webContents: { send: vi.fn() } }
}

beforeEach(() => {
  mockGetAllWindows.mockReset()
})

describe('ElectronNotifier', () => {
  it('fans the notification out to every open window', () => {
    const a = makeWin()
    const b = makeWin()
    mockGetAllWindows.mockReturnValue([a, b])

    new ElectronNotifier().notify('download:progress', {
      downloadId: 'd1',
      videoId: 'v1',
      url: 'https://x',
      percent: 50,
      stage: 'downloading',
      bytesDownloaded: 5,
      totalBytes: 10
    } as never)

    expect(a.webContents.send).toHaveBeenCalledTimes(1)
    expect(b.webContents.send).toHaveBeenCalledTimes(1)
  })

  it('forwards the channel name as the first arg and the payload as the second', () => {
    const win = makeWin()
    mockGetAllWindows.mockReturnValue([win])

    const payload = { fooBar: 1 } as never
    new ElectronNotifier().notify('db-updated', payload)

    expect(win.webContents.send).toHaveBeenCalledWith('db-updated', payload)
  })

  it('is a no-op when no windows are open', () => {
    mockGetAllWindows.mockReturnValue([])
    expect(() => new ElectronNotifier().notify('db-updated', undefined as never)).not.toThrow()
    // No spy fires because there are no windows; nothing further to assert.
  })

  it('omits the payload arg for void-payload channels', () => {
    const win = makeWin()
    mockGetAllWindows.mockReturnValue([win])

    // The signature uses a conditional tuple type — `void` payload channels
    // accept zero extra args. We can't synthesise one in this test without
    // depending on the actual map, so spread an empty array instead and
    // confirm send was called with just the channel.
    const notifier = new ElectronNotifier()
    ;(notifier.notify as (channel: string, ...rest: unknown[]) => void)('db-updated')

    expect(win.webContents.send).toHaveBeenCalledWith('db-updated')
  })
})
