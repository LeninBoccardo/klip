import type { INotificationQueue, IDebouncer, INotifier, RootPathRef } from '@domain/ports'
import type { FileEvent } from '@domain/types'
import { collapseEvents, classifyPath } from '@domain/types'
import type { IReconcileDirectory, ReconcileResult } from './IReconcileDirectory'
import type { IEnrichMediaMetadata } from './IEnrichMediaMetadata'

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
 *   - < threshold collapsed events → granular per-creator reconciliation
 *   - ≥ threshold → full directory reconciliation
 *
 * Uses a double-buffer model: `drain()` atomically swaps the buffer so
 * events arriving during flush are captured for the next cycle.
 */
export class ProcessFileNotifications {
  /** Tracks the in-flight flush promise, if any. Null when no flush is running. */
  private flushPromise: Promise<void> | null = null
  /** Tracks the in-flight enrichMedia promise, if any. Prevents concurrent enrich runs. */
  private enrichPromise: Promise<unknown> | null = null
  private suspended = false

  constructor(
    private queue: INotificationQueue,
    private debouncer: IDebouncer,
    private reconcile: IReconcileDirectory,
    private notifier: INotifier,
    private rootPath: RootPathRef,
    private config: FlushConfig = {
      debounceMs: DEBOUNCE_MS,
      reconcileThreshold: RECONCILE_THRESHOLD
    },
    private enrichMedia?: IEnrichMediaMetadata
  ) {}

  /**
   * Suspend event processing. Events arriving while suspended are silently dropped.
   * Cancels any pending debounced flush AND awaits any in-flight flush so callers
   * can rely on no DB mutations being in progress when this resolves.
   */
  async suspend(): Promise<void> {
    this.suspended = true
    this.debouncer.cancel()
    if (this.flushPromise) {
      try {
        await this.flushPromise
      } catch {
        // Errors are already logged inside flush(); we just need to wait it out.
      }
    }
  }

  /**
   * Resume event processing. Drains and discards any stale buffered events
   * that accumulated during the suspension window.
   */
  async resume(): Promise<void> {
    // Discard stale events from the buffer
    await this.queue.drain()
    this.suspended = false
  }

  /** Whether the notification processor is currently suspended */
  isSuspended(): boolean {
    return this.suspended
  }

  /**
   * Receive a single file-system event.
   * Buffers it and (re)starts the debounce timer.
   * If a flush is in progress or processor is suspended, events are dropped.
   */
  handleEvent(event: FileEvent): void {
    if (this.suspended) return
    this.queue.enqueue(event)
    if (!this.flushPromise) {
      this.debouncer.schedule(() => this.flush(), this.config.debounceMs)
    }
  }

  /**
   * Drain the buffer, collapse events, and apply DB changes.
   * Stores its own promise on `this.flushPromise` so `suspend()` can await
   * any in-flight work. Returns the same promise so callers (and the
   * debouncer) can also await if they wish. Never rejects — internal errors
   * are logged.
   */
  private flush(): Promise<void> {
    if (this.flushPromise) return this.flushPromise
    this.flushPromise = this.runFlush().finally(() => {
      this.flushPromise = null
    })
    return this.flushPromise
  }

  private async runFlush(): Promise<void> {
    try {
      const raw = await this.queue.drain()
      const collapsed = collapseEvents(raw)

      if (collapsed.length === 0) return

      if (collapsed.length >= this.config.reconcileThreshold) {
        this.reconcile.execute(this.rootPath.value)
      } else {
        this.processGranular(collapsed)
      }

      this.notifier.notify('db-updated')

      // Enrich metadata for newly discovered entities (non-blocking, deduped).
      // If a previous enrichment is still running, skip — it'll pick up any
      // newly-pending entities in its own findByProbeStatus query.
      if (this.enrichMedia && !this.enrichPromise) {
        this.enrichPromise = this.enrichMedia
          .execute()
          .catch((err) => console.error('[klip] Enrichment failed:', err))
          .finally(() => {
            this.enrichPromise = null
          })
      }
    } catch (error) {
      console.error('[klip] Notification flush failed:', error)
    } finally {
      // Double-buffer: check if new events arrived during this flush
      if (this.queue.size() > 0 && !this.suspended) {
        this.debouncer.schedule(() => this.flush(), this.config.debounceMs)
      }
    }
  }

  /**
   * Granular processing: classify events by creator and reconcile the
   * affected creators inside a **single** outer transaction. Unknown paths
   * are silently skipped (filtered by ChokidarWatcher anyway).
   */
  private processGranular(events: FileEvent[]): ReconcileResult {
    const affectedCreators = new Set<string>()

    for (const event of events) {
      const classification = classifyPath(this.rootPath.value, event.path)
      if (classification.kind !== 'unknown') {
        affectedCreators.add(classification.creatorName)
      }
    }

    return this.reconcile.executeForCreatorBatch(this.rootPath.value, [...affectedCreators])
  }
}
