import type { FileEvent } from '@domain/types'

/**
 * Abstraction over a file-system watcher.
 * Implementations observe a root directory for changes and emit FileEvent objects.
 */
export interface IFileWatcher {
  /** Begin watching. Events are emitted via the callback registered with `onEvent`. */
  start(): void

  /** Stop watching and release all OS handles. Safe to call multiple times. */
  stop(): void

  /** Stop the current watcher, switch to a new root path, and start watching again. */
  restart(newRootPath: string): void

  /** Register the handler invoked for every file-system change. Must be called before `start`. */
  onEvent(callback: (event: FileEvent) => void): void
}
