import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IFetchVideoInfo } from '@use-cases/IFetchVideoInfo'
import type { IDownloadVideo } from '@use-cases/IDownloadVideo'
import type { IProbeMediaFile } from '@use-cases/IProbeMediaFile'
import type { IFetchChannelInfo } from '@use-cases/IFetchChannelInfo'

const electron = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
  return {
    handlers,
    ipcMain: {
      handle: vi.fn((channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
        handlers.set(channel, handler)
      }),
      on: vi.fn()
    }
  }
})

vi.mock('electron', () => ({ ipcMain: electron.ipcMain }))

import { registerDownloadController } from '@main/interface-adapters/controllers/DownloadController'

function makeMocks(): {
  fetchVideoInfo: IFetchVideoInfo
  downloadVideo: IDownloadVideo
  probeMediaFile: IProbeMediaFile
  fetchChannelInfo: IFetchChannelInfo
} {
  return {
    fetchVideoInfo: { execute: vi.fn().mockResolvedValue({ title: 't' }) },
    downloadVideo: {
      execute: vi.fn().mockResolvedValue({ downloadId: 'dl-1', videoId: 'v-1' }),
      cancel: vi.fn()
    },
    probeMediaFile: { execute: vi.fn().mockResolvedValue({ duration: 1, resolution: null, fileSize: null }) },
    fetchChannelInfo: { execute: vi.fn().mockResolvedValue({ matched: false }) }
  } as unknown as {
    fetchVideoInfo: IFetchVideoInfo
    downloadVideo: IDownloadVideo
    probeMediaFile: IProbeMediaFile
    fetchChannelInfo: IFetchChannelInfo
  }
}

async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = electron.handlers.get(channel)
  if (!handler) throw new Error(`No handler for "${channel}"`)
  return (await handler({}, ...args)) as T
}

describe('DownloadController', () => {
  beforeEach(() => {
    electron.handlers.clear()
    electron.ipcMain.handle.mockClear()
  })

  it('registers all five download channels', () => {
    const m = makeMocks()
    registerDownloadController(m.fetchVideoInfo, m.downloadVideo, m.probeMediaFile, m.fetchChannelInfo)
    expect([...electron.handlers.keys()].sort()).toEqual(
      [
        'cancel-download',
        'download-video',
        'fetch-channel-info',
        'fetch-video-info',
        'probe-media-file'
      ].sort()
    )
  })

  it('"fetch-video-info" forwards url', async () => {
    const m = makeMocks()
    registerDownloadController(m.fetchVideoInfo, m.downloadVideo, m.probeMediaFile, m.fetchChannelInfo)
    await invoke('fetch-video-info', 'https://example.com/x')
    expect(m.fetchVideoInfo.execute).toHaveBeenCalledWith('https://example.com/x')
  })

  it('"download-video" passes url + creatorName as a request object', async () => {
    const m = makeMocks()
    registerDownloadController(m.fetchVideoInfo, m.downloadVideo, m.probeMediaFile, m.fetchChannelInfo)
    await invoke('download-video', 'https://example.com/y', 'Creator A')
    expect(m.downloadVideo.execute).toHaveBeenCalledWith({
      url: 'https://example.com/y',
      creatorName: 'Creator A'
    })
  })

  it('"cancel-download" delegates to downloadVideo.cancel', async () => {
    const m = makeMocks()
    registerDownloadController(m.fetchVideoInfo, m.downloadVideo, m.probeMediaFile, m.fetchChannelInfo)
    await invoke('cancel-download', 'dl-1')
    expect(m.downloadVideo.cancel).toHaveBeenCalledWith('dl-1')
  })

  it('"probe-media-file" forwards filePath', async () => {
    const m = makeMocks()
    registerDownloadController(m.fetchVideoInfo, m.downloadVideo, m.probeMediaFile, m.fetchChannelInfo)
    await invoke('probe-media-file', '/tmp/v.mp4')
    expect(m.probeMediaFile.execute).toHaveBeenCalledWith('/tmp/v.mp4')
  })

  it('"fetch-channel-info" forwards url', async () => {
    const m = makeMocks()
    registerDownloadController(m.fetchVideoInfo, m.downloadVideo, m.probeMediaFile, m.fetchChannelInfo)
    await invoke('fetch-channel-info', 'https://youtube.com/@x')
    expect(m.fetchChannelInfo.execute).toHaveBeenCalledWith('https://youtube.com/@x')
  })
})
