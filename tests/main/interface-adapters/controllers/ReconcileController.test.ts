import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IReconcileDirectory, ReconcileResult } from '@use-cases/IReconcileDirectory'
import type { RootPathRef } from '@domain/ports'

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

import { registerReconcileController } from '@main/interface-adapters/controllers/ReconcileController'

const emptyResult: ReconcileResult = {
  creatorsAdded: 0,
  creatorsMarkedMissing: 0,
  creatorsRecovered: 0,
  videosAdded: 0,
  videosMarkedMissing: 0,
  videosRecovered: 0,
  cutsAdded: 0,
  cutsMarkedMissing: 0,
  cutsRecovered: 0
}

describe('ReconcileController', () => {
  beforeEach(() => {
    electron.handlers.clear()
    electron.ipcMain.handle.mockClear()
  })

  it('registers the "reconcile" channel', () => {
    const reconcile: IReconcileDirectory = {
      execute: vi.fn().mockReturnValue(emptyResult),
      executeForCreator: vi.fn()
    }
    const rootPathRef: RootPathRef = { value: '/root' }

    registerReconcileController(reconcile, rootPathRef)

    expect(electron.handlers.has('reconcile')).toBe(true)
  })

  it('reads rootPathRef.value at invocation time, not at registration time', async () => {
    const reconcile: IReconcileDirectory = {
      execute: vi.fn().mockReturnValue(emptyResult),
      executeForCreator: vi.fn()
    }
    const rootPathRef: RootPathRef = { value: '/old/root' }

    registerReconcileController(reconcile, rootPathRef)

    // Mutate the ref AFTER registration — simulates a successful root migration.
    rootPathRef.value = '/new/root'

    const handler = electron.handlers.get('reconcile')!
    await handler({})

    expect(reconcile.execute).toHaveBeenCalledWith('/new/root')
  })
})
