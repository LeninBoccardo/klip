import type { FileEvent } from '@domain/types'

/**
 * Abstraction over the file-event notification buffer.
 *
 * Implementations must guarantee that `drain()` returns a consistent
 * snapshot — events enqueued during or after drain go to a fresh buffer
 * (double-buffer swap).
 */
export interface INotificationQueue {
  /** Add a file-system event to the buffer */
  enqueue(event: FileEvent): void

  /**
   * Atomically drain the buffer: returns all buffered events and
   * resets to an empty state. Events arriving after this call
   * go into a fresh buffer (double-buffer swap).
   */
  drain(): Promise<FileEvent[]>

  /** Current number of buffered events (best-effort, may be slightly stale) */
  size(): number
}
