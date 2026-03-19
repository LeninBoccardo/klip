import { BrowserWindow } from 'electron'
import type { INotifier } from '@domain/ports'
import type { NotificationEventMap, NotificationChannel } from '@domain/types'

/**
 * Sends typed notifications to all open renderer windows via `webContents.send`.
 * Channel/payload types are enforced by `NotificationEventMap`.
 */
export class ElectronNotifier implements INotifier {
  notify<C extends NotificationChannel>(
    channel: C,
    ...payload: NotificationEventMap[C] extends void ? [] : [NotificationEventMap[C]]
  ): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(channel, ...payload)
    }
  }
}
