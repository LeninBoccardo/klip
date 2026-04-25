import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ICutRepository } from '@domain/repositories'

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

import { registerCutController } from '@main/interface-adapters/controllers/CutController'

function makeRepo(): ICutRepository {
  return {
    findAll: vi.fn(),
    findAllActive: vi.fn(),
    findById: vi.fn().mockReturnValue(null),
    findByCreatorId: vi.fn(),
    findByVideoId: vi.fn(),
    findByTags: vi.fn().mockReturnValue([]),
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

describe('CutController', () => {
  beforeEach(() => {
    electron.handlers.clear()
    electron.ipcMain.handle.mockClear()
  })

  it('registers all five cut channels', () => {
    registerCutController(makeRepo())
    expect([...electron.handlers.keys()].sort()).toEqual(
      [
        'delete-cut',
        'get-cut-by-id',
        'get-cuts-by-tags',
        'get-cuts-paginated',
        'restore-cut'
      ].sort()
    )
  })

  it('"get-cuts-paginated" forwards params', async () => {
    const repo = makeRepo()
    registerCutController(repo)
    const params = { page: 1, pageSize: 10 }
    await invoke('get-cuts-paginated', params)
    expect(repo.findPaginated).toHaveBeenCalledWith(params)
  })

  it('"get-cut-by-id" forwards id', async () => {
    const repo = makeRepo()
    registerCutController(repo)
    await invoke('get-cut-by-id', 'cut-1')
    expect(repo.findById).toHaveBeenCalledWith('cut-1')
  })

  it('"get-cuts-by-tags" forwards the tags array', async () => {
    const repo = makeRepo()
    registerCutController(repo)
    await invoke('get-cuts-by-tags', ['highlight', 'funny'])
    expect(repo.findByTags).toHaveBeenCalledWith(['highlight', 'funny'])
  })

  it('"delete-cut" sets status=deleted with timestamp', async () => {
    const repo = makeRepo()
    registerCutController(repo)
    await invoke('delete-cut', 'cut-1')
    expect(repo.updateStatus).toHaveBeenCalledWith('cut-1', 'deleted', expect.any(String))
  })

  it('"restore-cut" sets status=active with null deletedAt', async () => {
    const repo = makeRepo()
    registerCutController(repo)
    await invoke('restore-cut', 'cut-1')
    expect(repo.updateStatus).toHaveBeenCalledWith('cut-1', 'active', null)
  })
})
