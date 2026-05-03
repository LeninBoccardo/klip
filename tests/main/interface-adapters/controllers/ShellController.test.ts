import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IResolveMediaUrl } from '@use-cases/IResolveMediaUrl'
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
    },
    shell: { openPath: vi.fn(), showItemInFolder: vi.fn() },
    app: { getPath: vi.fn((key: string) => `/tmp/klip-${key}`) }
  }
})

vi.mock('electron', () => ({
  ipcMain: electron.ipcMain,
  shell: electron.shell,
  app: electron.app
}))

import { registerShellController } from '@main/interface-adapters/controllers/ShellController'

function makeDeps(): {
  resolveMediaUrl: IResolveMediaUrl
  rootPath: RootPathRef
} {
  return {
    resolveMediaUrl: { resolve: vi.fn().mockReturnValue(null) },
    rootPath: { value: '/tmp/klip-root' }
  }
}

async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = electron.handlers.get(channel)
  if (!handler) throw new Error(`No handler for "${channel}"`)
  return (await handler({}, ...args)) as T
}

describe('ShellController', () => {
  beforeEach(() => {
    electron.handlers.clear()
    electron.ipcMain.handle.mockClear()
    electron.shell.openPath.mockReset()
  })

  it('registers shell channels', () => {
    const d = makeDeps()
    registerShellController(d.resolveMediaUrl, d.rootPath)
    expect([...electron.handlers.keys()].sort()).toEqual(
      ['open-log-folder', 'open-media-externally', 'open-path-in-shell'].sort()
    )
  })

  it('open-log-folder opens app.getPath("logs")', async () => {
    const d = makeDeps()
    electron.shell.openPath.mockResolvedValue('')
    registerShellController(d.resolveMediaUrl, d.rootPath)

    const result = await invoke<{ ok: boolean }>('open-log-folder')

    expect(electron.app.getPath).toHaveBeenCalledWith('logs')
    expect(electron.shell.openPath).toHaveBeenCalledWith('/tmp/klip-logs')
    expect(result.ok).toBe(true)
  })

  it('returns ok=false when the entity has no resolvable file', async () => {
    const d = makeDeps()
    registerShellController(d.resolveMediaUrl, d.rootPath)

    const result = await invoke<{ ok: boolean; error?: string }>(
      'open-media-externally',
      'video',
      'gone'
    )

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/not found/i)
    expect(electron.shell.openPath).not.toHaveBeenCalled()
  })

  it('opens the resolved path on success and returns ok=true', async () => {
    const d = makeDeps()
    vi.mocked(d.resolveMediaUrl.resolve).mockReturnValue('/canonical/path.mkv')
    electron.shell.openPath.mockResolvedValue('')
    registerShellController(d.resolveMediaUrl, d.rootPath)

    const result = await invoke<{ ok: boolean; error?: string }>(
      'open-media-externally',
      'video',
      'v-1'
    )

    expect(d.resolveMediaUrl.resolve).toHaveBeenCalledWith({
      kind: 'video',
      id: 'v-1',
      asset: 'file'
    })
    expect(electron.shell.openPath).toHaveBeenCalledWith('/canonical/path.mkv')
    expect(result.ok).toBe(true)
  })

  it('forwards the OS error message back to the renderer', async () => {
    const d = makeDeps()
    vi.mocked(d.resolveMediaUrl.resolve).mockReturnValue('/canonical/path.mkv')
    electron.shell.openPath.mockResolvedValue('No application is associated')
    registerShellController(d.resolveMediaUrl, d.rootPath)

    const result = await invoke<{ ok: boolean; error?: string }>(
      'open-media-externally',
      'video',
      'v-1'
    )

    expect(result.ok).toBe(false)
    expect(result.error).toBe('No application is associated')
  })

  it('routes cuts through the same resolver', async () => {
    const d = makeDeps()
    vi.mocked(d.resolveMediaUrl.resolve).mockReturnValue('/canonical/cut.mp4')
    electron.shell.openPath.mockResolvedValue('')
    registerShellController(d.resolveMediaUrl, d.rootPath)

    await invoke('open-media-externally', 'cut', 'cut-1')

    expect(d.resolveMediaUrl.resolve).toHaveBeenCalledWith({
      kind: 'cut',
      id: 'cut-1',
      asset: 'file'
    })
  })
})
