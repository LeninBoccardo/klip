import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture event handlers registered via autoUpdater.on(name, fn) so the test
// can fire them synthetically — mirrors the real `electron-updater` event
// stream without bringing in the package's GHReleases polling.
const autoUpdaterMock = vi.hoisted(() => {
  const handlersInner = new Map<string, (...args: unknown[]) => void>()
  return {
    handlersInner,
    autoDownload: false,
    autoInstallOnAppQuit: false,
    on: vi.fn((name: string, fn: (...args: unknown[]) => void) => {
      handlersInner.set(name, fn)
    }),
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
    quitAndInstall: vi.fn()
  }
})

vi.mock('electron-updater', () => ({ autoUpdater: autoUpdaterMock }))
vi.mock('electron', () => ({
  app: { getVersion: () => '1.0.0' }
}))

import {
  ElectronAutoUpdater,
  DisabledUpdater
} from '@main/framework-drivers/electron/ElectronAutoUpdater'
import type { UpdaterStatus } from '@shared/types'

function fire(event: string, ...args: unknown[]): void {
  const fn = autoUpdaterMock.handlersInner.get(event)
  if (!fn) throw new Error(`No handler registered for "${event}"`)
  fn(...args)
}

describe('ElectronAutoUpdater', () => {
  let updater: ElectronAutoUpdater

  beforeEach(() => {
    autoUpdaterMock.handlersInner.clear()
    autoUpdaterMock.on.mockClear()
    autoUpdaterMock.checkForUpdates.mockClear()
    autoUpdaterMock.quitAndInstall.mockClear()
    autoUpdaterMock.autoDownload = false
    autoUpdaterMock.autoInstallOnAppQuit = false
    updater = new ElectronAutoUpdater()
  })

  it('configures autoDownload + autoInstallOnAppQuit on construction', () => {
    expect(autoUpdaterMock.autoDownload).toBe(true)
    expect(autoUpdaterMock.autoInstallOnAppQuit).toBe(true)
  })

  it('starts in idle with the current app version', () => {
    expect(updater.getStatus()).toMatchObject({
      state: 'idle',
      currentVersion: '1.0.0',
      newVersion: null,
      downloadPercent: null,
      errorMessage: null,
      lastCheckedAt: null
    })
  })

  it('transitions idle → checking → available → downloading → ready', () => {
    fire('checking-for-update')
    expect(updater.getStatus().state).toBe('checking')

    fire('update-available', { version: '1.1.0' })
    expect(updater.getStatus()).toMatchObject({ state: 'available', newVersion: '1.1.0' })

    fire('download-progress', { percent: 47.6 })
    expect(updater.getStatus()).toMatchObject({ state: 'downloading', downloadPercent: 48 })

    fire('update-downloaded', { version: '1.1.0' })
    expect(updater.getStatus()).toMatchObject({
      state: 'ready',
      newVersion: '1.1.0',
      downloadPercent: 100
    })
  })

  it("transitions to 'up-to-date' when no update is available", () => {
    fire('update-not-available', { version: '1.0.0' })
    expect(updater.getStatus()).toMatchObject({
      state: 'up-to-date',
      newVersion: null,
      downloadPercent: null,
      errorMessage: null,
      currentVersion: '1.0.0'
    })
  })

  it('records the error message and does NOT touch lastCheckedAt on error', () => {
    fire('checking-for-update')
    const checkedAtBeforeError = updater.getStatus().lastCheckedAt
    expect(checkedAtBeforeError).not.toBeNull()

    fire('error', new Error('Network unreachable'))

    expect(updater.getStatus()).toMatchObject({
      state: 'error',
      errorMessage: 'Network unreachable',
      // Documented invariant: error transitions don't bump lastCheckedAt so
      // the UI can keep showing "last checked: 5 min ago" while indicating
      // something failed.
      lastCheckedAt: checkedAtBeforeError
    })
  })

  it('clears errorMessage when a non-error transition fires later', () => {
    fire('error', new Error('boom'))
    expect(updater.getStatus().errorMessage).toBe('boom')

    fire('checking-for-update')
    expect(updater.getStatus().errorMessage).toBeNull()
  })

  it('notifies every subscriber on each transition; unsubscribe stops calls', () => {
    const a = vi.fn()
    const b = vi.fn()
    const unsubA = updater.onStatusChange(a)
    updater.onStatusChange(b)

    fire('checking-for-update')
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    const calledWith = a.mock.calls[0][0] as UpdaterStatus
    expect(calledWith.state).toBe('checking')

    unsubA()
    fire('update-not-available', { version: '1.0.0' })
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(2)
  })

  it('checkForUpdates delegates to autoUpdater.checkForUpdates', async () => {
    await updater.checkForUpdates()
    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('quitAndInstall delegates to autoUpdater.quitAndInstall', () => {
    updater.quitAndInstall()
    expect(autoUpdaterMock.quitAndInstall).toHaveBeenCalledTimes(1)
  })
})

describe('DisabledUpdater', () => {
  it("reports 'disabled' state with the current app version", () => {
    const dis = new DisabledUpdater()
    expect(dis.getStatus()).toMatchObject({
      state: 'disabled',
      currentVersion: '1.0.0',
      newVersion: null
    })
  })

  it('checkForUpdates and quitAndInstall are no-ops', async () => {
    const dis = new DisabledUpdater()
    autoUpdaterMock.checkForUpdates.mockClear()
    autoUpdaterMock.quitAndInstall.mockClear()

    await dis.checkForUpdates()
    dis.quitAndInstall()

    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
    expect(autoUpdaterMock.quitAndInstall).not.toHaveBeenCalled()
  })

  it('returns a no-op unsubscribe from onStatusChange', () => {
    const dis = new DisabledUpdater()
    const unsub = dis.onStatusChange(() => undefined)
    expect(typeof unsub).toBe('function')
    expect(() => unsub()).not.toThrow()
  })
})
