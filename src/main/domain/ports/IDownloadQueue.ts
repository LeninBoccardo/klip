/**
 * Abstraction over a concurrency-limited task queue for downloads.
 * Backed by p-queue in the adapter layer.
 */
export interface IDownloadQueue {
  /** Enqueue a download task. Resolves when the task itself resolves. */
  enqueue<T>(task: () => Promise<T>): Promise<T>

  /** Number of tasks currently queued (waiting, not running) */
  pending(): number

  /** Number of tasks currently running */
  running(): number

  /** Resolves when all queued and running tasks complete */
  onIdle(): Promise<void>

  /** Clear pending tasks (does not cancel running ones) */
  clear(): void
}
