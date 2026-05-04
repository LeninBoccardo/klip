import { describe, it, expect, vi, beforeEach } from 'vitest'

const electron = vi.hoisted(() => ({
  ipcRenderer: {
    invoke: vi.fn()
  }
}))

vi.mock('electron', () => ({ ipcRenderer: electron.ipcRenderer }))

import { createTypedInvoker } from '@preload/create-typed-invoker'

beforeEach(() => {
  electron.ipcRenderer.invoke.mockReset()
})

describe('createTypedInvoker', () => {
  it('returns a function that calls ipcRenderer.invoke with the channel pinned', async () => {
    electron.ipcRenderer.invoke.mockResolvedValue('result')
    const invoke = createTypedInvoker('get-creator-by-id')

    const got = await invoke('creator-1')

    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith('get-creator-by-id', 'creator-1')
    expect(got).toBe('result')
  })

  it('forwards every argument the contract declares (variadic)', async () => {
    electron.ipcRenderer.invoke.mockResolvedValue({ creators: [], videos: [], cuts: [], tags: [] })
    const search = createTypedInvoker('search-all')

    await search('cats', 5)

    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith('search-all', 'cats', 5)
  })

  it('forwards a no-args call with just the channel', async () => {
    electron.ipcRenderer.invoke.mockResolvedValue({
      creators: { total: 0, byStatus: {} },
      videos: { total: 0, byStatus: {}, transcribed: 0, totalDuration: 0, totalSize: 0 },
      cuts: { total: 0, totalDuration: 0, totalSize: 0 },
      downloadsByDay: [],
      topCreators: [],
      storage: { videosBytes: 0, cutsBytes: 0, totalBytes: 0 }
    })
    const stats = createTypedInvoker('get-library-stats')

    await stats()

    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith('get-library-stats')
  })

  it('returns a fresh function per channel (no shared state across invokers)', () => {
    const a = createTypedInvoker('get-creator-by-id')
    const b = createTypedInvoker('get-video-by-id')
    expect(a).not.toBe(b)
  })

  it('propagates a rejection from ipcRenderer.invoke', async () => {
    electron.ipcRenderer.invoke.mockRejectedValueOnce(new Error('main exploded'))
    const invoke = createTypedInvoker('get-creator-by-id')

    await expect(invoke('creator-1')).rejects.toThrow('main exploded')
  })
})
