import type { INotificationQueue, IDebouncer, INotifier } from '@domain/ports'
import type { FileEvent } from '@domain/types'
import { collapseEvents } from '@domain/types'
import type { ReconcileDirectory } from './ReconcileDirectory'

/** Named constants — tune based on real-world profiling */
export const RECONCILE_THRESHOLD = 50
export const DEBOUNCE_MS = 1000

export interface FlushConfig {
  debounceMs: number
  reconcileThreshold: number
}

/**
 * Orchestrates file-system notification processing.
 *
 * Collects raw file events into a buffer, debounces bursts, collapses
 * duplicate/conflicting events per path, then decides:
 *   - < threshold collapsed events → granular DB updates (stubbed → reconciliation)
 *   - ≥ threshold → full directory reconciliation
 *
 * Uses a double-buffer model: `drain()` atomically swaps the buffer so
 * events arriving during flush are captured for the next cycle.
 */
export class ProcessFileNotifications {
  private flushing = false

  constructor(
    private queue: INotificationQueue,
    private debouncer: IDebouncer,
    private reconcile: ReconcileDirectory,
    private notifier: INotifier,
    private rootPath: string,
    private config: FlushConfig = {
      debounceMs: DEBOUNCE_MS,
      reconcileThreshold: RECONCILE_THRESHOLD
    }
  ) {}

  /**
   * Receive a single file-system event.
   * Buffers it and (re)starts the debounce timer.
   * If a flush is in progress, events accumulate in the staging buffer
   * and are picked up after the current flush completes.
   */
  handleEvent(event: FileEvent): void {
    this.queue.enqueue(event)
    if (!this.flushing) {
      this.debouncer.schedule(() => this.flush(), this.config.debounceMs)
    }
  }

  /**
   * Drain the buffer, collapse events, and apply DB changes.
   * Called by the debouncer when the quiet period expires.
   */
  private async flush(): Promise<void> {
    this.flushing = true
    try {
      const raw = await this.queue.drain()
      const collapsed = collapseEvents(raw)

      if (collapsed.length === 0) return

      if (collapsed.length >= this.config.reconcileThreshold) {
        this.reconcile.execute(this.rootPath)
      } else {
        // TODO: Granular path — classify each event via PathClassifier,
        // map to entities via EntityMapper, upsert/delete individually.
        // Stubbed: falls back to full reconciliation until file watcher
        // infrastructure (PathClassifier + EntityMapper) is implemented.
        this.reconcile.execute(this.rootPath)
      }

      this.notifier.notify('db-updated')
    } catch (error) {
      console.error('[klip] Notification flush failed:', error)
    } finally {
      this.flushing = false

      // Double-buffer: check if new events arrived during this flush
      if (this.queue.size() > 0) {
        this.debouncer.schedule(() => this.flush(), this.config.debounceMs)
      }
    }
  }
}
