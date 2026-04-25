import { vi } from 'vitest'

export type IpcInvokeHandler = (
  event: unknown,
  ...args: unknown[]
) => unknown | Promise<unknown>

/**
 * Returns a fake `electron.ipcMain` that captures every `handle()` registration
 * into a Map. Test files use this with `vi.hoisted` + `vi.mock('electron', ...)`
 * to assert which channels were registered and to invoke the handlers directly.
 */
export function createIpcMainStub(): {
  ipcMain: { handle: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> }
  handlers: Map<string, IpcInvokeHandler>
  invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>
} {
  const handlers = new Map<string, IpcInvokeHandler>()
  const handle = vi.fn((channel: string, handler: IpcInvokeHandler) => {
    handlers.set(channel, handler)
  })
  const invoke = async <T>(channel: string, ...args: unknown[]): Promise<T> => {
    const handler = handlers.get(channel)
    if (!handler) {
      throw new Error(`No handler registered for channel "${channel}"`)
    }
    return (await handler({}, ...args)) as T
  }
  return {
    ipcMain: { handle, on: vi.fn() },
    handlers,
    invoke
  }
}
