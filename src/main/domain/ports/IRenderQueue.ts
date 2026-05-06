/**
 * Concurrency-limited task queue for ffmpeg renders. Mirrors `IDownloadQueue`
 * because the download / render pattern is identical (long-running spawn +
 * progress + cancel), but the two queues stay separate so a stuck render
 * doesn't starve downloads.
 *
 * MVP concurrency: 1 (ffmpeg saturates a single core for re-encode; even
 * `-c copy` is I/O-bound on the same disk videos are read from). Ports
 * accept a `concurrency` arg in the adapter so v2 can lift it.
 */
export interface IRenderQueue {
  /** Enqueue a render task. Resolves when the task itself resolves. */
  enqueue<T>(task: () => Promise<T>): Promise<T>

  /** Number of tasks currently queued (waiting, not running). */
  pending(): number

  /** Number of tasks currently running. */
  running(): number

  /** Resolves when all queued and running tasks complete. */
  onIdle(): Promise<void>

  /** Clear pending tasks (does not cancel running ones — use the EditorSessionStore for that). */
  clear(): void
}
