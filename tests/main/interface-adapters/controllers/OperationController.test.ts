import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IOperationRepository } from '@domain/repositories'

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

import { registerOperationController } from '@main/interface-adapters/controllers/OperationController'

function makeRepo(): IOperationRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockReturnValue(null),
    findByStatus: vi.fn().mockReturnValue([]),
    updateStatus: vi.fn(),
    updatePayload: vi.fn()
  }
}

async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = electron.handlers.get(channel)
  if (!handler) throw new Error(`No handler for "${channel}"`)
  return (await handler({}, ...args)) as T
}

describe('OperationController', () => {
  beforeEach(() => {
    electron.handlers.clear()
    electron.ipcMain.handle.mockClear()
  })

  it('registers both operation channels', () => {
    registerOperationController(makeRepo())
    expect([...electron.handlers.keys()].sort()).toEqual(
      ['get-operation-by-id', 'get-operations-by-status'].sort()
    )
  })

  it('"get-operation-by-id" forwards id', async () => {
    const repo = makeRepo()
    registerOperationController(repo)
    await invoke('get-operation-by-id', 'op-1')
    expect(repo.findById).toHaveBeenCalledWith('op-1')
  })

  it('"get-operations-by-status" forwards status', async () => {
    const repo = makeRepo()
    registerOperationController(repo)
    await invoke('get-operations-by-status', 'pending')
    expect(repo.findByStatus).toHaveBeenCalledWith('pending')
  })
})
