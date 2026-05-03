import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IGetAllDistinctTags } from '@use-cases/IGetAllDistinctTags'
import type { IBulkUpdateTags } from '@use-cases/IBulkUpdateTags'
import type { IRenameTagGlobally } from '@use-cases/IRenameTagGlobally'
import type { IDeleteTagGlobally } from '@use-cases/IDeleteTagGlobally'

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

import { registerTagController } from '@main/interface-adapters/controllers/TagController'

function makeDeps(): {
  getAllDistinctTags: IGetAllDistinctTags
  bulkUpdateTags: IBulkUpdateTags
  renameTagGlobally: IRenameTagGlobally
  deleteTagGlobally: IDeleteTagGlobally
} {
  return {
    getAllDistinctTags: { execute: vi.fn().mockReturnValue([]) },
    bulkUpdateTags: { execute: vi.fn().mockReturnValue({ updated: 0, skipped: 0 }) },
    renameTagGlobally: {
      execute: vi.fn().mockReturnValue({ videosUpdated: 0, cutsUpdated: 0 })
    },
    deleteTagGlobally: {
      execute: vi.fn().mockReturnValue({ videosUpdated: 0, cutsUpdated: 0 })
    }
  }
}

async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = electron.handlers.get(channel)
  if (!handler) throw new Error(`No handler for "${channel}"`)
  return (await handler({}, ...args)) as T
}

describe('TagController', () => {
  beforeEach(() => {
    electron.handlers.clear()
    electron.ipcMain.handle.mockClear()
  })

  it('registers all four tag channels', () => {
    const d = makeDeps()
    registerTagController(
      d.getAllDistinctTags,
      d.bulkUpdateTags,
      d.renameTagGlobally,
      d.deleteTagGlobally
    )
    expect([...electron.handlers.keys()].sort()).toEqual(
      [
        'bulk-update-tags',
        'delete-tag-globally',
        'get-all-distinct-tags',
        'rename-tag-globally'
      ].sort()
    )
  })

  it('"delete-tag-globally" forwards the tag argument', async () => {
    const d = makeDeps()
    registerTagController(
      d.getAllDistinctTags,
      d.bulkUpdateTags,
      d.renameTagGlobally,
      d.deleteTagGlobally
    )

    await invoke('delete-tag-globally', 'wip')
    expect(d.deleteTagGlobally.execute).toHaveBeenCalledWith('wip')
  })

  it('"get-all-distinct-tags" delegates to GetAllDistinctTags', async () => {
    const d = makeDeps()
    vi.mocked(d.getAllDistinctTags.execute).mockReturnValue([
      { tag: 'music', videoCount: 3, cutCount: 2 }
    ])
    registerTagController(
      d.getAllDistinctTags,
      d.bulkUpdateTags,
      d.renameTagGlobally,
      d.deleteTagGlobally
    )

    const result = await invoke<{ tag: string }[]>('get-all-distinct-tags')

    expect(d.getAllDistinctTags.execute).toHaveBeenCalled()
    expect(result).toEqual([{ tag: 'music', videoCount: 3, cutCount: 2 }])
  })

  it('"bulk-update-tags" forwards the request payload', async () => {
    const d = makeDeps()
    registerTagController(
      d.getAllDistinctTags,
      d.bulkUpdateTags,
      d.renameTagGlobally,
      d.deleteTagGlobally
    )

    const request = {
      entityKind: 'video' as const,
      ids: ['v-1', 'v-2'],
      addTags: ['music']
    }
    await invoke('bulk-update-tags', request)
    expect(d.bulkUpdateTags.execute).toHaveBeenCalledWith(request)
  })

  it('"rename-tag-globally" forwards both tag arguments', async () => {
    const d = makeDeps()
    registerTagController(
      d.getAllDistinctTags,
      d.bulkUpdateTags,
      d.renameTagGlobally,
      d.deleteTagGlobally
    )

    await invoke('rename-tag-globally', 'old', 'new')
    expect(d.renameTagGlobally.execute).toHaveBeenCalledWith('old', 'new')
  })
})
