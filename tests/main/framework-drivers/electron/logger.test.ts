import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { App } from 'electron'

const mockLog = vi.hoisted(() => ({
  initialize: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  functions: {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  },
  variables: {} as Record<string, unknown>,
  transports: {
    file: {
      resolvePathFn: undefined as ((variables?: unknown) => string) | undefined,
      maxSize: 0,
      level: 'silly' as 'silly' | 'debug' | 'verbose' | 'info' | 'warn' | 'error'
    },
    console: {
      level: 'silly' as 'silly' | 'debug' | 'verbose' | 'info' | 'warn' | 'error'
    }
  }
}))

vi.mock('electron-log/main', () => ({ default: mockLog }))

import { initLogger } from '@main/framework-drivers/electron/logger'

interface FakeApp {
  getPath: (k: string) => string
  on: (event: string, listener: (...args: unknown[]) => void) => FakeApp
  __emit: (event: string, ...args: unknown[]) => void
}

function makeFakeApp(): FakeApp {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  const fake: FakeApp = {
    getPath: (k: string) => `/tmp/klip-${k}`,
    on(event, listener) {
      const list = listeners.get(event) ?? []
      list.push(listener)
      listeners.set(event, list)
      return fake
    },
    __emit(event, ...args) {
      for (const l of listeners.get(event) ?? []) l(...args)
    }
  }
  return fake
}

describe('initLogger', () => {
  beforeEach(() => {
    mockLog.initialize.mockClear()
    mockLog.error.mockClear()
    mockLog.info.mockClear()
    mockLog.transports.file.resolvePathFn = undefined
    mockLog.transports.file.maxSize = 0
    mockLog.transports.file.level = 'silly'
    mockLog.transports.console.level = 'silly'
    mockLog.variables = {}
  })

  it('configures the file transport path under app.getPath("logs") in production', () => {
    const app = makeFakeApp()
    initLogger(app as unknown as App)

    expect(mockLog.initialize).toHaveBeenCalledTimes(1)
    expect(typeof mockLog.transports.file.resolvePathFn).toBe('function')
    const resolved = mockLog.transports.file.resolvePathFn?.()
    expect(resolved).toMatch(/klip-logs/)
    expect(resolved).toMatch(/klip\.log$/)
  })

  it('writes the log into the project-local logs/ folder in dev mode', () => {
    const app = makeFakeApp()
    initLogger(app as unknown as App, { isDev: true })
    const resolved = mockLog.transports.file.resolvePathFn?.()
    expect(resolved).toMatch(/klip-dev\.log$/)
    expect(resolved).not.toMatch(/klip-logs/)
  })

  it('sets a 5MB rotation cap and info-level filtering in production', () => {
    initLogger(makeFakeApp() as unknown as App)
    expect(mockLog.transports.file.maxSize).toBe(5 * 1024 * 1024)
    expect(mockLog.transports.file.level).toBe('info')
    expect(mockLog.transports.console.level).toBe('info')
  })

  it('uses debug-level filtering in dev mode', () => {
    initLogger(makeFakeApp() as unknown as App, { isDev: true })
    expect(mockLog.transports.file.level).toBe('debug')
    expect(mockLog.transports.console.level).toBe('debug')
  })

  it('monkey-patches console.* to route through electron-log', () => {
    // Save and restore so other tests aren't polluted by the patch.
    const origConsole = { ...console }
    try {
      initLogger(makeFakeApp() as unknown as App)
      expect(console.log).toBe(mockLog.functions.log)
      expect(console.error).toBe(mockLog.functions.error)
      expect(console.warn).toBe(mockLog.functions.warn)
    } finally {
      Object.assign(console, origConsole)
    }
  })

  it('tags entries with processType=main', () => {
    initLogger(makeFakeApp() as unknown as App)
    expect(mockLog.variables.processType).toBe('main')
  })

  it('logs render-process-gone events', () => {
    const app = makeFakeApp()
    initLogger(app as unknown as App)

    app.__emit('render-process-gone', {}, {}, { reason: 'crashed', exitCode: 1 })

    expect(mockLog.error).toHaveBeenCalledWith(
      '[klip] render-process-gone',
      expect.objectContaining({ reason: 'crashed' })
    )
  })

  it('logs child-process-gone events', () => {
    const app = makeFakeApp()
    initLogger(app as unknown as App)

    app.__emit('child-process-gone', {}, { type: 'GPU', reason: 'killed' })

    expect(mockLog.error).toHaveBeenCalledWith(
      '[klip] child-process-gone',
      expect.objectContaining({ type: 'GPU' })
    )
  })

  it('logs uncaught exceptions and unhandled rejections from process', () => {
    const app = makeFakeApp()
    const procListeners = new Map<string, Array<(...args: unknown[]) => void>>()
    const origOn = process.on
    // Capture process.on calls registered by initLogger so we can fire them
    // without crashing the test runner with a real uncaughtException.
    vi.spyOn(process, 'on').mockImplementation(((
      event: string,
      listener: (...args: unknown[]) => void
    ) => {
      const list = procListeners.get(event) ?? []
      list.push(listener)
      procListeners.set(event, list)
      return process
    }) as typeof process.on)

    initLogger(app as unknown as App)
    procListeners.get('uncaughtException')?.forEach((l) => l(new Error('boom')))
    procListeners.get('unhandledRejection')?.forEach((l) => l(new Error('promise-boom')))

    expect(mockLog.error).toHaveBeenCalledWith('[klip] uncaughtException', expect.any(Error))
    expect(mockLog.error).toHaveBeenCalledWith('[klip] unhandledRejection', expect.any(Error))
    process.on = origOn
  })
})
