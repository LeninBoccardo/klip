import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IUpdater } from '@domain/ports'
import type { UpdaterStatus } from '@shared/types'

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

import { registerUpdaterController } from '@main/interface-adapters/controllers/UpdaterController'

function makeStatus(overrides: Partial<UpdaterStatus> = {}): UpdaterStatus {
  return {
    state: 'idle',
    currentVersion: '0.0.1',
    newVersion: null,
    downloadPercent: null,
    errorMessage: null,
    lastCheckedAt: null,
    ...overrides
  }
}

function makeUpdater(): IUpdater {
  return {
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
    quitAndInstall: vi.fn(),
    getStatus: vi.fn().mockReturnValue(makeStatus()),
    onStatusChange: vi.fn().mockReturnValue(() => {})
  }
}

async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = electron.handlers.get(channel)
  if (!handler) throw new Error(`No handler for "${channel}"`)
  return (await handler({}, ...args)) as T
}

describe('UpdaterController', () => {
  beforeEach(() => {
    electron.handlers.clear()
    electron.ipcMain.handle.mockClear()
  })

  it('registers all three updater channels', () => {
    registerUpdaterController(makeUpdater())
    expect([...electron.handlers.keys()].sort()).toEqual(
      ['check-for-updates', 'get-updater-status', 'install-update'].sort()
    )
  })

  it('"check-for-updates" delegates to updater.checkForUpdates and returns latest status', async () => {
    const updater = makeUpdater()
    vi.mocked(updater.getStatus).mockReturnValue(
      makeStatus({ state: 'available', newVersion: '0.0.2' })
    )
    registerUpdaterController(updater)

    const result = await invoke<UpdaterStatus>('check-for-updates')

    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(updater.getStatus).toHaveBeenCalledTimes(1)
    expect(result.state).toBe('available')
    expect(result.newVersion).toBe('0.0.2')
  })

  it('"install-update" delegates to updater.quitAndInstall', async () => {
    const updater = makeUpdater()
    registerUpdaterController(updater)

    await invoke('install-update')

    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1)
  })

  it('"get-updater-status" returns the current snapshot without checking', async () => {
    const updater = makeUpdater()
    vi.mocked(updater.getStatus).mockReturnValue(makeStatus({ state: 'up-to-date' }))
    registerUpdaterController(updater)

    const result = await invoke<UpdaterStatus>('get-updater-status')

    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    expect(updater.getStatus).toHaveBeenCalledTimes(1)
    expect(result.state).toBe('up-to-date')
  })
})
