import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IGetStorageStats } from '@use-cases/IGetStorageStats'
import type { IGetLibraryStats } from '@use-cases/IGetLibraryStats'
import type { StorageStats, LibraryStats } from '@shared/types'

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

import { registerStatsController } from '@main/interface-adapters/controllers/StatsController'

function makeStorageStats(overrides: Partial<StorageStats> = {}): StorageStats {
  return { videosBytes: 0, cutsBytes: 0, totalBytes: 0, ...overrides }
}

function makeLibraryStats(overrides: Partial<LibraryStats> = {}): LibraryStats {
  return {
    creators: { total: 0, byStatus: {} },
    videos: { total: 0, byStatus: {}, transcribed: 0, totalDuration: 0, totalSize: 0 },
    cuts: { total: 0, totalDuration: 0, totalSize: 0 },
    downloadsByDay: [],
    topCreators: [],
    storage: makeStorageStats(),
    ...overrides
  }
}

function makeDeps(): { getStorageStats: IGetStorageStats; getLibraryStats: IGetLibraryStats } {
  return {
    getStorageStats: { execute: vi.fn().mockReturnValue(makeStorageStats()) },
    getLibraryStats: { execute: vi.fn().mockReturnValue(makeLibraryStats()) }
  }
}

async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = electron.handlers.get(channel)
  if (!handler) throw new Error(`No handler for "${channel}"`)
  return (await handler({}, ...args)) as T
}

describe('StatsController', () => {
  beforeEach(() => {
    electron.handlers.clear()
    electron.ipcMain.handle.mockClear()
  })

  it('registers both stats channels', () => {
    const d = makeDeps()
    registerStatsController(d.getStorageStats, d.getLibraryStats)
    expect([...electron.handlers.keys()].sort()).toEqual(['get-library-stats', 'get-storage-stats'])
  })

  it('"get-storage-stats" forwards to IGetStorageStats.execute', async () => {
    const d = makeDeps()
    registerStatsController(d.getStorageStats, d.getLibraryStats)

    await invoke('get-storage-stats')

    expect(d.getStorageStats.execute).toHaveBeenCalledTimes(1)
    expect(d.getLibraryStats.execute).not.toHaveBeenCalled()
  })

  it('"get-library-stats" forwards to IGetLibraryStats.execute', async () => {
    const d = makeDeps()
    registerStatsController(d.getStorageStats, d.getLibraryStats)

    await invoke('get-library-stats')

    expect(d.getLibraryStats.execute).toHaveBeenCalledTimes(1)
    expect(d.getStorageStats.execute).not.toHaveBeenCalled()
  })

  it('returns the storage-stats use-case result verbatim', async () => {
    const d = makeDeps()
    const stats = makeStorageStats({ videosBytes: 1_000, cutsBytes: 500, totalBytes: 1_500 })
    vi.mocked(d.getStorageStats.execute).mockReturnValue(stats)
    registerStatsController(d.getStorageStats, d.getLibraryStats)

    const result = await invoke<StorageStats>('get-storage-stats')

    expect(result).toEqual(stats)
  })

  it('returns the library-stats use-case result verbatim', async () => {
    const d = makeDeps()
    const stats = makeLibraryStats({
      creators: { total: 3, byStatus: { active: 3 } },
      videos: {
        total: 12,
        byStatus: { active: 10, deleted: 2 },
        transcribed: 5,
        totalDuration: 3_600,
        totalSize: 10_000
      },
      topCreators: [{ creatorId: 'c-1', name: 'Alice', videoCount: 7 }]
    })
    vi.mocked(d.getLibraryStats.execute).mockReturnValue(stats)
    registerStatsController(d.getStorageStats, d.getLibraryStats)

    const result = await invoke<LibraryStats>('get-library-stats')

    expect(result).toEqual(stats)
    expect(result.topCreators[0]?.name).toBe('Alice')
  })
})
