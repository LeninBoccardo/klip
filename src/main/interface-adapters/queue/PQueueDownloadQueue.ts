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

  pending(): number {
    return this.pQueue.pending
  }

  running(): number {
    return this.pQueue.size
  }

  async onIdle(): Promise<void> {
    return this.pQueue.onIdle()
  }

  clear(): void {
    this.pQueue.clear()
  }
}
