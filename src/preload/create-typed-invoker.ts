import { ipcRenderer } from 'electron'
import type { IpcContract } from '@shared/ipc-contract'
import type { InvokeChannel } from '@shared/ipc-contract'

/**
 * Type-safe wrapper around ipcRenderer.invoke.
 * Returns a function whose params and result match the IpcContract.
 *
 * Only accepts invoke channels (request/response), not push channels.
 */
export function createTypedInvoker<C extends InvokeChannel>(
  channel: C
): (...args: IpcContract[C]['params']) => Promise<IpcContract[C]['result']> {
  return (...args: IpcContract[C]['params']) => ipcRenderer.invoke(channel, ...args)
}
