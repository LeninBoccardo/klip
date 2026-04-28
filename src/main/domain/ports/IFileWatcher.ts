import type { FileEvent } from '@domain/types'

/**
 * Abstraction over a file-system watcher.
 * Implementations observe a root directory for changes and emit FileEvent objects.
 */
export interface IFileWatcher {
  /** Begin watching. Events are emitted via the callback registered with `onEvent`. */
  start(): void

  /**
   * Stop watching and release all OS handles. Resolves once the underlying
   * watcher has fully closed. Safe to call multiple times.
   */
  stop(): Promise<void>

  /**
   * Stop the current watcher, switch to a new root path, and start watching again.
   * Resolves once the new watcher is up and the old one is fully closed —
   * preventing duplicate events from concurrent watchers during the swap.
   */
  restart(newRootPath: string): Promise<void>

  /** Register the handler invoked for every file-system change. Must be called before `start`. */
  onEvent(callback: (event: FileEvent) => void): void
}
