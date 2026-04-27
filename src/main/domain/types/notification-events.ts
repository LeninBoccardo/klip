import type { DownloadProgress, MigrateRootProgress, UpdaterStatus } from '@shared/types'

/**
 * Typed event map for renderer notifications.
 * Each key is a channel name; the value is the payload type.
 * Use `void` for channels that carry no data.
 *
 * To add a new notification:
 *   1. Add the channel + payload type here
 *   2. The INotifier port and ElectronNotifier pick it up automatically
 *   3. Add a matching listener in the preload/renderer layer
 */
export interface NotificationEventMap {
  'db-updated': void
  'download-progress': DownloadProgress
  'migrate-root-progress': MigrateRootProgress
  'updater-status': UpdaterStatus
}

/** Union of all valid notification channel names */
export type NotificationChannel = keyof NotificationEventMap
