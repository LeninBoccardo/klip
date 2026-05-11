import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Session, WebContents } from 'electron'

const electronMock = vi.hoisted(() => {
  const appListeners = new Map<string, Array<(...args: unknown[]) => void>>()
  return {
    appListeners,
    app: {
      on(event: string, listener: (...args: unknown[]) => void) {
        const list = appListeners.get(event) ?? []
        list.push(listener)
        appListeners.set(event, list)
      }
    },
    session: {
      defaultSession: {
        setPermissionRequestHandler: vi.fn(),
        setPermissionCheckHandler: vi.fn()
      }
    },
    shell: {
      openExternal: vi.fn().mockResolvedValue(undefined)
    },
    log: {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn()
    }
  }
})

vi.mock('electron', () => ({
  app: electronMock.app,
  session: electronMock.session,
  shell: electronMock.shell
}))
vi.mock('electron-log/main', () => ({ default: electronMock.log }))

import {
  applySecurityHardening,
  isInternalNavigation
} from '@main/framework-drivers/electron/security-hardening'

interface FakeContents {
  navListener?: (event: { preventDefault: () => void }, url: string) => void
  windowOpenHandler?: (args: { url: string }) => { action: 'deny' | 'allow' }
  on(event: string, listener: (event: { preventDefault: () => void }, url: string) => void): void
  setWindowOpenHandler(handler: (args: { url: string }) => { action: 'deny' | 'allow' }): void
}

function makeContents(): FakeContents {
  const c: FakeContents = {
    on(event, listener) {
      if (event === 'will-navigate') c.navListener = listener
    },
    setWindowOpenHandler(handler) {
      c.windowOpenHandler = handler
    }
  }
  return c
}

describe('isInternalNavigation', () => {
  it('allows klip-media:// URLs', () => {
    expect(isInternalNavigation('klip-media://video/abc/file')).toBe(true)
  })

  it('allows production file:// renderer entry', () => {
    expect(isInternalNavigation('file:///C:/app/out/renderer/index.html')).toBe(true)
  })

  it('rejects plain file:// URLs not pointing at index.html', () => {
    expect(isInternalNavigation('file:///etc/passwd')).toBe(false)
    expect(isInternalNavigation('file:///C:/Windows/System32/cmd.exe')).toBe(false)
  })

  it('rejects external https:// URLs', () => {
    expect(isInternalNavigation('https://youtube.com/watch?v=x')).toBe(false)
    expect(isInternalNavigation('https://evil.example.com')).toBe(false)
  })

  it('rejects javascript: and data: schemes', () => {
    expect(isInternalNavigation('javascript:alert(1)')).toBe(false)
    expect(isInternalNavigation('data:text/html,<script>x</script>')).toBe(false)
  })

  it('rejects malformed URLs', () => {
    expect(isInternalNavigation('not a url')).toBe(false)
  })

  it('allows the dev-server origin when ELECTRON_RENDERER_URL is set', () => {
    const orig = process.env.ELECTRON_RENDERER_URL
    process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173/'
    expect(isInternalNavigation('http://localhost:5173/index.html')).toBe(true)
    expect(isInternalNavigation('http://localhost:5173/some/path')).toBe(true)
    expect(isInternalNavigation('http://localhost:6000/')).toBe(false)
    process.env.ELECTRON_RENDERER_URL = orig
  })
})

describe('applySecurityHardening', () => {
  beforeEach(() => {
    electronMock.appListeners.clear()
    electronMock.shell.openExternal.mockClear()
    electronMock.log.warn.mockClear()
    electronMock.session.defaultSession.setPermissionRequestHandler.mockClear()
    electronMock.session.defaultSession.setPermissionCheckHandler.mockClear()
  })

  it('registers a web-contents-created listener and permission handlers', () => {
    applySecurityHardening()

    expect(electronMock.appListeners.has('web-contents-created')).toBe(true)
    expect(electronMock.session.defaultSession.setPermissionRequestHandler).toHaveBeenCalledTimes(1)
    expect(electronMock.session.defaultSession.setPermissionCheckHandler).toHaveBeenCalledTimes(1)

    // Permission request handler always denies.
    const requestHandler = electronMock.session.defaultSession.setPermissionRequestHandler.mock
      .calls[0][0] as (wc: WebContents, perm: string, cb: (granted: boolean) => void) => void
    const cb = vi.fn()
    requestHandler({} as WebContents, 'media', cb)
    expect(cb).toHaveBeenCalledWith(false)

    const checkHandler = electronMock.session.defaultSession.setPermissionCheckHandler.mock
      .calls[0][0] as () => boolean
    expect(checkHandler()).toBe(false)
  })

  it('blocks will-navigate to external URLs and forwards youtube via shell.openExternal', () => {
    applySecurityHardening()
    const contents = makeContents()
    const [listener] = electronMock.appListeners.get('web-contents-created')!
    listener({} as Event, contents as unknown as WebContents)

    const ev = { preventDefault: vi.fn() }
    contents.navListener!(ev, 'https://youtube.com/watch?v=abc')

    expect(ev.preventDefault).toHaveBeenCalled()
    expect(electronMock.shell.openExternal).toHaveBeenCalledWith('https://youtube.com/watch?v=abc')
  })

  it('blocks will-navigate to non-allowlisted external hosts without opening a browser', () => {
    applySecurityHardening()
    const contents = makeContents()
    const [listener] = electronMock.appListeners.get('web-contents-created')!
    listener({} as Event, contents as unknown as WebContents)

    const ev = { preventDefault: vi.fn() }
    contents.navListener!(ev, 'https://evil.example.com/exfil')

    expect(ev.preventDefault).toHaveBeenCalled()
    expect(electronMock.shell.openExternal).not.toHaveBeenCalled()
    expect(electronMock.log.warn).toHaveBeenCalled()
  })

  it('lets internal navigation through without preventDefault', () => {
    applySecurityHardening()
    const contents = makeContents()
    const [listener] = electronMock.appListeners.get('web-contents-created')!
    listener({} as Event, contents as unknown as WebContents)

    const ev = { preventDefault: vi.fn() }
    contents.navListener!(ev, 'klip-media://video/abc/file')

    expect(ev.preventDefault).not.toHaveBeenCalled()
    expect(electronMock.shell.openExternal).not.toHaveBeenCalled()
  })

  it('window-open handler denies and routes allowed hosts to shell.openExternal', () => {
    applySecurityHardening()
    const contents = makeContents()
    const [listener] = electronMock.appListeners.get('web-contents-created')!
    listener({} as Event, contents as unknown as WebContents)

    const result = contents.windowOpenHandler!({ url: 'https://youtu.be/abc' })
    expect(result.action).toBe('deny')
    expect(electronMock.shell.openExternal).toHaveBeenCalledWith('https://youtu.be/abc')
  })

  it('window-open handler denies and does NOT open a browser for disallowed hosts', () => {
    applySecurityHardening()
    const contents = makeContents()
    const [listener] = electronMock.appListeners.get('web-contents-created')!
    listener({} as Event, contents as unknown as WebContents)

    const result = contents.windowOpenHandler!({ url: 'https://evil.example.com' })
    expect(result.action).toBe('deny')
    expect(electronMock.shell.openExternal).not.toHaveBeenCalled()
  })

  it('rejects javascript: in setWindowOpenHandler', () => {
    applySecurityHardening()
    const contents = makeContents()
    const [listener] = electronMock.appListeners.get('web-contents-created')!
    listener({} as Event, contents as unknown as WebContents)

    const result = contents.windowOpenHandler!({ url: 'javascript:alert(1)' })
    expect(result.action).toBe('deny')
    expect(electronMock.shell.openExternal).not.toHaveBeenCalled()
  })

  it('uses the supplied session factory (for testing)', () => {
    const fakeSession = {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn()
    }
    applySecurityHardening(() => fakeSession as unknown as Session)
    expect(fakeSession.setPermissionRequestHandler).toHaveBeenCalled()
    expect(fakeSession.setPermissionCheckHandler).toHaveBeenCalled()
  })
})
