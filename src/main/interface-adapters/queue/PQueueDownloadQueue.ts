import PQueue from 'p-queue'
import type { IDownloadQueue } from '@domain/ports'

/**
 * Concurrency-limited download queue backed by p-queue.
 * Default concurrency: 2 simultaneous downloads.
 */
export class PQueueDownloadQueue implements IDownloadQueue {
  private readonly pQueue: PQueue

  constructor(concurrency: number = 2) {
    this.pQueue = new PQueue({ concurrency })
  }

  async enqueue<T>(task: () => Promise<T>): Promise<T> {
    return this.pQueue.add(task) as Promise<T>
  }

  /**
   * Number of tasks waiting for a free slot.
   *
   * Note: p-queue's vocabulary is inverted vs. ours — `pQueue.size` is the
   * count of *queued* (not-yet-running) tasks, which is what our domain
   * calls `pending()`. See p-queue's API: https://github.com/sindresorhus/p-queue#size
   */
  pending(): number {
    return this.pQueue.size
  }

  /**
   * Number of tasks currently in flight.
   *
   * Note: this maps to p-queue's `pending` getter (= "promises that have
   * started but not yet resolved"). Despite the naming overlap with our
   * `pending()` above, these are *different* counters.
   */
  running(): number {
    return this.pQueue.pending
  }

  async onIdle(): Promise<void> {
    return this.pQueue.onIdle()
  }

  clear(): void {
    this.pQueue.clear()
  }
}
