import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ISettingsRepository } from '@domain/repositories'
import type { IMigrateRootFolder } from '@use-cases/IMigrateRootFolder'

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
    dialog: { showOpenDialog: vi.fn() },
    browserWindow: { fromWebContents: vi.fn() }
  }
})

vi.mock('electron', () => ({
  ipcMain: electron.ipcMain,
  dialog: electron.dialog,
  BrowserWindow: { fromWebContents: electron.browserWindow.fromWebContents }
}))

import { registerSettingsController } from '@main/interface-adapters/controllers/SettingsController'

function makeMocks(): {
  settingsRepo: ISettingsRepository
  migrateRootFolder: IMigrateRootFolder
} {
  return {
    settingsRepo: {
      get: vi.fn().mockReturnValue(null),
      set: vi.fn(),
      getAll: vi.fn().mockReturnValue({})
    },
    migrateRootFolder: {
      execute: vi.fn().mockResolvedValue({ success: true, movedCount: 0 })
    }
  }
}

/** A minimal stub for the IPC invoke event passed to handlers. */
const stubEvent = { sender: { id: 1 } as unknown }

async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = electron.handlers.get(channel)
  if (!handler) throw new Error(`No handler for "${channel}"`)
  return (await handler(stubEvent, ...args)) as T
}

describe('SettingsController', () => {
  beforeEach(() => {
    electron.handlers.clear()
    electron.ipcMain.handle.mockClear()
    electron.dialog.showOpenDialog.mockReset()
    electron.browserWindow.fromWebContents.mockReset()
  })

  it('registers all five settings channels', () => {
    const { settingsRepo, migrateRootFolder } = makeMocks()
    registerSettingsController(settingsRepo, migrateRootFolder)

    expect([...electron.handlers.keys()].sort()).toEqual(
      ['get-setting', 'get-settings', 'migrate-root', 'select-folder', 'set-setting'].sort()
    )
  })

  it('"get-settings" delegates to settingsRepo.getAll', async () => {
    const { settingsRepo, migrateRootFolder } = makeMocks()
    vi.mocked(settingsRepo.getAll).mockReturnValue({ rootPath: '/r' })
    registerSettingsController(settingsRepo, migrateRootFolder)

    const result = await invoke('get-settings')
    expect(result).toEqual({ rootPath: '/r' })
  })

  it('"get-setting" delegates with the key argument', async () => {
    const { settingsRepo, migrateRootFolder } = makeMocks()
    vi.mocked(settingsRepo.get).mockReturnValue('/some/path')
    registerSettingsController(settingsRepo, migrateRootFolder)

    const result = await invoke('get-setting', 'rootPath')
    expect(settingsRepo.get).toHaveBeenCalledWith('rootPath')
    expect(result).toBe('/some/path')
  })

  it('"set-setting" rejects rootPath writes — must go through migrate-root', async () => {
    const { settingsRepo, migrateRootFolder } = makeMocks()
    registerSettingsController(settingsRepo, migrateRootFolder)

    await expect(invoke('set-setting', 'rootPath', '/new')).rejects.toThrow(/migrate-root/)
    expect(settingsRepo.set).not.toHaveBeenCalled()
  })

  it('"set-setting" rejects unknown keys not in the allowlist', async () => {
    const { settingsRepo, migrateRootFolder } = makeMocks()
    registerSettingsController(settingsRepo, migrateRootFolder)

    await expect(invoke('set-setting', 'arbitrary', 'value')).rejects.toThrow(/not user-writable/)
    expect(settingsRepo.set).not.toHaveBeenCalled()
  })

  it('"set-setting" allows playbackOnNavigate with a valid value', async () => {
    const { settingsRepo, migrateRootFolder } = makeMocks()
    registerSettingsController(settingsRepo, migrateRootFolder)

    await invoke('set-setting', 'playbackOnNavigate', 'floating')
    expect(settingsRepo.set).toHaveBeenCalledWith('playbackOnNavigate', 'floating')
  })

  it('"set-setting" rejects an out-of-range playbackOnNavigate value', async () => {
    const { settingsRepo, migrateRootFolder } = makeMocks()
    registerSettingsController(settingsRepo, migrateRootFolder)

    await expect(invoke('set-setting', 'playbackOnNavigate', 'bogus')).rejects.toThrow(/invalid/)
    expect(settingsRepo.set).not.toHaveBeenCalled()
  })

  it('"set-setting" allows theme with each valid value', async () => {
    const { settingsRepo, migrateRootFolder } = makeMocks()
    registerSettingsController(settingsRepo, migrateRootFolder)

    for (const value of ['light', 'dark', 'system']) {
      await invoke('set-setting', 'theme', value)
      expect(settingsRepo.set).toHaveBeenCalledWith('theme', value)
    }
  })

  it('"set-setting" rejects an out-of-range theme value', async () => {
    const { settingsRepo, migrateRootFolder } = makeMocks()
    registerSettingsController(settingsRepo, migrateRootFolder)

    await expect(invoke('set-setting', 'theme', 'sepia')).rejects.toThrow(/invalid/)
    expect(settingsRepo.set).not.toHaveBeenCalled()
  })

  it('"set-setting" allows language with each supported locale', async () => {
    const { settingsRepo, migrateRootFolder } = makeMocks()
    registerSettingsController(settingsRepo, migrateRootFolder)

    for (const value of ['en', 'pt-BR', 'es']) {
      await invoke('set-setting', 'language', value)
      expect(settingsRepo.set).toHaveBeenCalledWith('language', value)
    }
  })

  it('"set-setting" rejects an unsupported language', async () => {
    const { settingsRepo, migrateRootFolder } = makeMocks()
    registerSettingsController(settingsRepo, migrateRootFolder)

    await expect(invoke('set-setting', 'language', 'fr')).rejects.toThrow(/invalid/)
    expect(settingsRepo.set).not.toHaveBeenCalled()
  })

  it('"migrate-root" calls migrateRootFolder.execute with the new path', async () => {
    const { settingsRepo, migrateRootFolder } = makeMocks()
    registerSettingsController(settingsRepo, migrateRootFolder)

    const result = await invoke('migrate-root', '/new/root')
    expect(migrateRootFolder.execute).toHaveBeenCalledWith('/new/root')
    expect(result).toEqual({ success: true, movedCount: 0 })
  })

  it('"select-folder" returns null when the sender has no window', async () => {
    const { settingsRepo, migrateRootFolder } = makeMocks()
    electron.browserWindow.fromWebContents.mockReturnValue(null)
    registerSettingsController(settingsRepo, migrateRootFolder)

    const result = await invoke('select-folder')
    expect(result).toBeNull()
    expect(electron.browserWindow.fromWebContents).toHaveBeenCalledWith(stubEvent.sender)
    expect(electron.dialog.showOpenDialog).not.toHaveBeenCalled()
  })

  it('"select-folder" returns null when the dialog is canceled', async () => {
    const { settingsRepo, migrateRootFolder } = makeMocks()
    electron.browserWindow.fromWebContents.mockReturnValue({} as unknown)
    electron.dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    registerSettingsController(settingsRepo, migrateRootFolder)

    const result = await invoke('select-folder')
    expect(result).toBeNull()
  })

  it('"select-folder" returns the first selected path on success', async () => {
    const { settingsRepo, migrateRootFolder } = makeMocks()
    electron.browserWindow.fromWebContents.mockReturnValue({} as unknown)
    electron.dialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/picked/folder', '/ignored/second']
    })
    registerSettingsController(settingsRepo, migrateRootFolder)

    const result = await invoke('select-folder')
    expect(result).toBe('/picked/folder')
  })
})
