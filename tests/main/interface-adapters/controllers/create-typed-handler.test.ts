import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture every handler registered via ipcMain.handle so we can invoke it
// directly with synthetic args and assert on the validation behaviour.
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

import { createTypedHandler } from '@main/interface-adapters/controllers/create-typed-handler'

describe('createTypedHandler runtime validation', () => {
  beforeEach(() => {
    electron.handlers.clear()
    electron.ipcMain.handle.mockClear()
  })

  it('passes through a well-typed payload to the handler', async () => {
    const inner = vi.fn().mockResolvedValue('ok')
    createTypedHandler('get-creator-by-id', inner)
    const handler = electron.handlers.get('get-creator-by-id')!

    const result = await handler({}, 'creator-1')

    expect(result).toBe('ok')
    expect(inner).toHaveBeenCalledWith({}, 'creator-1')
  })

  it('rejects a payload with the wrong type before invoking the handler', async () => {
    const inner = vi.fn()
    createTypedHandler('get-creator-by-id', inner)
    const handler = electron.handlers.get('get-creator-by-id')!

    // Suppress the validation log to keep test output clean.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(handler({}, 42)).rejects.toThrow(
      'Invalid payload for IPC channel "get-creator-by-id"'
    )
    expect(inner).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('rejects a payload with the wrong arity', async () => {
    const inner = vi.fn()
    createTypedHandler('set-setting', inner)
    const handler = electron.handlers.get('set-setting')!
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Channel expects [key: string, value: string]; one-arg call must be rejected.
    await expect(handler({}, 'theme')).rejects.toThrow(
      'Invalid payload for IPC channel "set-setting"'
    )
    expect(inner).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('rejects a malformed PaginationParams object', async () => {
    const inner = vi.fn()
    createTypedHandler('get-creators-paginated', inner)
    const handler = electron.handlers.get('get-creators-paginated')!
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // pageSize is required and must be a number — string should fail.
    await expect(handler({}, { page: 1, pageSize: '999999999' })).rejects.toThrow()
    expect(inner).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('accepts both arities for fetch-video-comments (videoId-only and videoId+maxComments)', async () => {
    const inner = vi.fn().mockResolvedValue('ok')
    createTypedHandler('fetch-video-comments', inner)
    const handler = electron.handlers.get('fetch-video-comments')!

    await handler({}, 'video-1')
    await handler({}, 'video-1', 200)

    expect(inner).toHaveBeenCalledTimes(2)
    expect(inner).toHaveBeenNthCalledWith(1, {}, 'video-1')
    expect(inner).toHaveBeenNthCalledWith(2, {}, 'video-1', 200)
  })

  // ── Numeric bounds (defense against renderer-XSS-driven DoS) ──

  it('rejects an out-of-range pageSize on a paginated channel', async () => {
    const inner = vi.fn()
    createTypedHandler('get-videos-paginated', inner)
    const handler = electron.handlers.get('get-videos-paginated')!
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Each of these violates one bound. They must all be rejected before the
    // use case is called; an XSS-driven `pageSize: 1e9` is the canonical
    // attack vector this guard is built for.
    for (const params of [
      { page: 1, pageSize: 1e9 },
      { page: 1, pageSize: 0 },
      { page: 1, pageSize: -1 },
      { page: 1, pageSize: 1.5 },
      { page: 0, pageSize: 50 },
      { page: -1, pageSize: 50 }
    ]) {
      await expect(handler({}, params)).rejects.toThrow(
        'Invalid payload for IPC channel "get-videos-paginated"'
      )
    }
    expect(inner).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('rejects an out-of-range maxComments on fetch-video-comments', async () => {
    const inner = vi.fn()
    createTypedHandler('fetch-video-comments', inner)
    const handler = electron.handlers.get('fetch-video-comments')!
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(handler({}, 'video-1', Infinity)).rejects.toThrow()
    await expect(handler({}, 'video-1', 1_000_000)).rejects.toThrow()
    await expect(handler({}, 'video-1', 0)).rejects.toThrow()
    expect(inner).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('rejects an out-of-range limit on search-all', async () => {
    const inner = vi.fn()
    createTypedHandler('search-all', inner)
    const handler = electron.handlers.get('search-all')!
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(handler({}, 'q', 1e6)).rejects.toThrow()
    await expect(handler({}, 'q', 0)).rejects.toThrow()
    expect(inner).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('rejects an out-of-range limit on get-audit-log-recent', async () => {
    const inner = vi.fn()
    createTypedHandler('get-audit-log-recent', inner)
    const handler = electron.handlers.get('get-audit-log-recent')!
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(handler({}, Number.MAX_SAFE_INTEGER)).rejects.toThrow()
    await expect(handler({}, 0)).rejects.toThrow()
    expect(inner).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })
})
