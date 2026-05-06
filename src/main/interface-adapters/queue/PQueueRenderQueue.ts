import PQueue from 'p-queue'
import type { IRenderQueue } from '@domain/ports'

/**
 * Concurrency-limited render queue backed by p-queue. Mirrors
 * `PQueueDownloadQueue` so the operational surface (size/pending counters,
 * onIdle drain on shutdown) is identical between the two queues.
 *
 * Default concurrency 1 — ffmpeg pegs a CPU core for re-encode, and
 * stream-copy mode is I/O-bound on the same disk we read source videos
 * from. v2 can pass a higher value if the host has spare cores.
 */
export class PQueueRenderQueue implements IRenderQueue {
  private readonly pQueue: PQueue

  constructor(concurrency: number = 1) {
    this.pQueue = new PQueue({ concurrency })
  }

  async enqueue<T>(task: () => Promise<T>): Promise<T> {
    return this.pQueue.add(task) as Promise<T>
  }

  pending(): number {
    return this.pQueue.size
  }

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
