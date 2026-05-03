import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ISearchAll } from '@use-cases/ISearchAll'
import type { ISearchTranscripts } from '@use-cases/ISearchTranscripts'

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

import { registerSearchController } from '@main/interface-adapters/controllers/SearchController'

function makeDeps(): { searchAll: ISearchAll; searchTranscripts: ISearchTranscripts } {
  return {
    searchAll: {
      execute: vi.fn().mockReturnValue({ creators: [], videos: [], cuts: [], tags: [] })
    },
    searchTranscripts: {
      execute: vi.fn().mockReturnValue({ hits: [], totalApproximate: 0 })
    }
  }
}

async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = electron.handlers.get(channel)
  if (!handler) throw new Error(`No handler for "${channel}"`)
  return (await handler({}, ...args)) as T
}

describe('SearchController', () => {
  beforeEach(() => {
    electron.handlers.clear()
    electron.ipcMain.handle.mockClear()
  })

  it('registers both search channels', () => {
    const d = makeDeps()
    registerSearchController(d.searchAll, d.searchTranscripts)
    expect([...electron.handlers.keys()].sort()).toEqual(['search-all', 'search-transcripts'])
  })

  it('"search-transcripts" forwards params to the use case', async () => {
    const d = makeDeps()
    registerSearchController(d.searchAll, d.searchTranscripts)
    const params = { query: 'hello', limit: 10, offset: 0 }
    await invoke('search-transcripts', params)
    expect(d.searchTranscripts.execute).toHaveBeenCalledWith(params)
  })

  it('forwards the query and limit to the use case', async () => {
    const d = makeDeps()
    registerSearchController(d.searchAll, d.searchTranscripts)

    await invoke('search-all', 'cats', 5)

    expect(d.searchAll.execute).toHaveBeenCalledWith('cats', 5)
  })

  it('passes a single-arg call through (limit defaults inside the use case)', async () => {
    const d = makeDeps()
    registerSearchController(d.searchAll, d.searchTranscripts)

    await invoke('search-all', 'cats')

    // The schema accepts either tuple shape; the controller forwards `undefined`
    // for the missing limit and the use case substitutes the default.
    expect(d.searchAll.execute).toHaveBeenCalledWith('cats', undefined)
  })

  it('returns the use case result verbatim', async () => {
    const d = makeDeps()
    vi.mocked(d.searchAll.execute).mockReturnValue({
      creators: [],
      videos: [],
      cuts: [],
      tags: [{ tag: 'music', videoCount: 1, cutCount: 0 }]
    })
    registerSearchController(d.searchAll, d.searchTranscripts)

    const result = await invoke<{ tags: { tag: string }[] }>('search-all', 'mus', 5)

    expect(result.tags).toEqual([{ tag: 'music', videoCount: 1, cutCount: 0 }])
  })
})
