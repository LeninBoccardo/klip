import type { NotificationEventMap, NotificationChannel } from '@domain/types'

/**
 * Typed push-notification port for sending events to the renderer process.
 *
 * The channel→payload contract is defined in `NotificationEventMap`.
 * Channels with `void` payload require no arguments beyond the channel name;
 * channels with data payloads require the payload as the second argument.
 */
export interface INotifier {
  notify<C extends NotificationChannel>(
    channel: C,
    ...payload: NotificationEventMap[C] extends void ? [] : [NotificationEventMap[C]]
  ): void
}
