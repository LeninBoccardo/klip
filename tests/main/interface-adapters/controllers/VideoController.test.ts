import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IVideoRepository } from '@domain/repositories'

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

import { registerVideoController } from '@main/interface-adapters/controllers/VideoController'

function makeRepo(): IVideoRepository {
  return {
    findAll: vi.fn(),
    findAllActive: vi.fn(),
    findById: vi.fn().mockReturnValue(null),
    findByCreatorId: vi.fn(),
    findByProbeStatus: vi.fn(),
    findPaginated: vi
      .fn()
      .mockReturnValue({ data: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }),
    upsert: vi.fn(),
    updateStatus: vi.fn(),
    updateProbeStatus: vi.fn(),
    delete: vi.fn(),
    updateFilePathPrefix: vi.fn()
  }
}

async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = electron.handlers.get(channel)
  if (!handler) throw new Error(`No handler for "${channel}"`)
  return (await handler({}, ...args)) as T
}

describe('VideoController', () => {
  beforeEach(() => {
    electron.handlers.clear()
    electron.ipcMain.handle.mockClear()
  })

  it('registers all four video channels', () => {
    registerVideoController(makeRepo())
    expect([...electron.handlers.keys()].sort()).toEqual(
      ['delete-video', 'get-video-by-id', 'get-videos-paginated', 'restore-video'].sort()
    )
  })

  it('"get-videos-paginated" forwards params', async () => {
    const repo = makeRepo()
    registerVideoController(repo)
    const params = { page: 1, pageSize: 10, creatorId: 'c-1' }
    await invoke('get-videos-paginated', params)
    expect(repo.findPaginated).toHaveBeenCalledWith(params)
  })

  it('"get-video-by-id" forwards id', async () => {
    const repo = makeRepo()
    registerVideoController(repo)
    await invoke('get-video-by-id', 'video-1')
    expect(repo.findById).toHaveBeenCalledWith('video-1')
  })

  it('"delete-video" sets status=deleted with timestamp', async () => {
    const repo = makeRepo()
    registerVideoController(repo)
    await invoke('delete-video', 'video-1')
    expect(repo.updateStatus).toHaveBeenCalledWith('video-1', 'deleted', expect.any(String))
  })

  it('"restore-video" sets status=active with null deletedAt', async () => {
    const repo = makeRepo()
    registerVideoController(repo)
    await invoke('restore-video', 'video-1')
    expect(repo.updateStatus).toHaveBeenCalledWith('video-1', 'active', null)
  })
})
