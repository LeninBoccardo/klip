import PQueue from 'p-queue'
import type { FileEvent } from '@domain/types'
import type { INotificationQueue } from '@domain/ports'

/**
 * Notification buffer backed by p-queue (concurrency: 1).
 *
 * - `enqueue()` pushes events synchronously for low overhead.
 * - `drain()` runs through p-queue to serialize the buffer swap,
 *   guaranteeing atomicity even if future operations become async.
 * - `size()` reads the buffer length directly (best-effort snapshot).
 *
 * Double-buffer contract: after `drain()` resolves, the returned array
 * is the old buffer and a fresh `[]` accepts new events.
 */
export class PQueueNotificationQueue implements INotificationQueue {
  private buffer: FileEvent[] = []
  private readonly pQueue = new PQueue({ concurrency: 1 })

  enqueue(event: FileEvent): void {
    this.buffer.push(event)
  }

  async drain(): Promise<FileEvent[]> {
    return this.pQueue.add(() => {
      const events = this.buffer
      this.buffer = []
      return events
    }) as Promise<FileEvent[]>
  }

  size(): number {
    return this.buffer.length
  }
}
