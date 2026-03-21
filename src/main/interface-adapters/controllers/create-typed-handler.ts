import { ipcMain } from 'electron'
import type { IpcContract } from '@shared/ipc-contract'
import type { InvokeChannel } from '@shared/ipc-contract'

/**
 * Type-safe wrapper around ipcMain.handle.
 * Extracts param/result types from IpcContract for the given channel.
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
  ipcMain.handle(channel, handler)
}
