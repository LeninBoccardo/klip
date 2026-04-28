import { ipcMain } from 'electron'
import type { IpcContract, InvokeChannel } from '@shared/ipc-contract'
import { ipcSchemas } from '@shared/ipc-schemas'

/**
 * Type-safe wrapper around `ipcMain.handle` with **runtime payload validation**.
 *
 * `IpcContract` only enforces types at compile time. A compromised renderer
 * (e.g. XSS via stored YouTube content) can invoke any channel with arbitrary
 * payloads — the contract type signatures don't survive the IPC boundary.
 * Every invocation goes through the matching zod schema in `ipc-schemas.ts`;
 * malformed payloads throw before the handler runs, so use-cases keep their
 * "trust the input shape" assumption.
 *
 * Only accepts invoke channels (request/response), not push channels.
 */
export function createTypedHandler<C extends InvokeChannel>(
  channel: C,
  handler: (
    event: Electron.IpcMainInvokeEvent,
    ...args: IpcContract[C]['params']
  ) => Promise<IpcContract[C]['result']> | IpcContract[C]['result']
): void {
  const schema = ipcSchemas[channel]
  ipcMain.handle(channel, async (event, ...rawArgs) => {
    const parsed = schema.safeParse(rawArgs)
    if (!parsed.success) {
      // Renderer-side error message stays high-level — the formatted issues
      // live in stderr for debugging, but we don't echo them back across IPC
      // (a malicious renderer should not get a precise "what to send" hint).
      console.error(`[klip] IPC payload rejected for "${channel}":`, parsed.error.format())
      throw new Error(`Invalid payload for IPC channel "${channel}"`)
    }
    return handler(event, ...(parsed.data as IpcContract[C]['params']))
  })
}
