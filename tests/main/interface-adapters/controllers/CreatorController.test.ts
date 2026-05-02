import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ICreatorRepository } from '@domain/repositories'
import type { IRegisterCreator } from '@use-cases/IRegisterCreator'

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

import { registerCreatorController } from '@main/interface-adapters/controllers/CreatorController'

function makeRepo(): ICreatorRepository {
  return {
    findById: vi.fn().mockReturnValue(null),
    findByFolderName: vi.fn(),
    findAllActive: vi.fn(),
    findPaginated: vi
      .fn()
      .mockReturnValue({ data: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }),
    upsert: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn()
  } as unknown as ICreatorRepository
}

function makeRegisterCreator(): IRegisterCreator {
  return { execute: vi.fn().mockResolvedValue({ creatorId: 'new-id' }) }
}

async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = electron.handlers.get(channel)
  if (!handler) throw new Error(`No handler for "${channel}"`)
  return (await handler({}, ...args)) as T
}

describe('CreatorController', () => {
  beforeEach(() => {
    electron.handlers.clear()
    electron.ipcMain.handle.mockClear()
  })

  it('registers all five creator channels', () => {
    registerCreatorController(makeRepo(), makeRegisterCreator())
    expect([...electron.handlers.keys()].sort()).toEqual(
      [
        'delete-creator',
        'get-creator-by-id',
        'get-creators-paginated',
        'register-creator',
        'restore-creator'
      ].sort()
    )
  })

  it('"register-creator" forwards request to RegisterCreator.execute', async () => {
    const repo = makeRepo()
    const useCase = makeRegisterCreator()
    registerCreatorController(repo, useCase)
    const request = {
      channelInfo: {
        channelId: 'UC_x',
        channelName: 'X',
        channelUrl: null,
        uploaderUrl: null,
        subscriberCount: null,
        avatarUrl: null
      },
      displayName: 'X',
      folderName: 'x',
      notes: null,
      tags: []
    }
    const result = await invoke('register-creator', request)
    expect(useCase.execute).toHaveBeenCalledWith(request)
    expect(result).toEqual({ creatorId: 'new-id' })
  })

  it('"get-creators-paginated" forwards params to findPaginated', async () => {
    const repo = makeRepo()
    registerCreatorController(repo, makeRegisterCreator())
    const params = { page: 1, pageSize: 10 }
    await invoke('get-creators-paginated', params)
    expect(repo.findPaginated).toHaveBeenCalledWith(params)
  })

  it('"get-creator-by-id" forwards id to findById', async () => {
    const repo = makeRepo()
    registerCreatorController(repo, makeRegisterCreator())
    await invoke('get-creator-by-id', 'creator-1')
    expect(repo.findById).toHaveBeenCalledWith('creator-1')
  })

  it('"delete-creator" sets status=deleted with a timestamp', async () => {
    const repo = makeRepo()
    registerCreatorController(repo, makeRegisterCreator())
    await invoke('delete-creator', 'creator-1')
    expect(repo.updateStatus).toHaveBeenCalledWith('creator-1', 'deleted', expect.any(String))
  })

  it('"restore-creator" sets status=active with null deletedAt', async () => {
    const repo = makeRepo()
    registerCreatorController(repo, makeRegisterCreator())
    await invoke('restore-creator', 'creator-1')
    expect(repo.updateStatus).toHaveBeenCalledWith('creator-1', 'active', null)
  })
})
