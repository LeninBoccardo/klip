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
 * Merge two ReconcileResult objects by summing all counters.
 */
function mergeResults(a: ReconcileResult, b: ReconcileResult): ReconcileResult {
  return {
    creatorsAdded: a.creatorsAdded + b.creatorsAdded,
    creatorsMarkedMissing: a.creatorsMarkedMissing + b.creatorsMarkedMissing,
    creatorsRecovered: a.creatorsRecovered + b.creatorsRecovered,
    videosAdded: a.videosAdded + b.videosAdded,
    videosMarkedMissing: a.videosMarkedMissing + b.videosMarkedMissing,
    videosRecovered: a.videosRecovered + b.videosRecovered,
    cutsAdded: a.cutsAdded + b.cutsAdded,
    cutsMarkedMissing: a.cutsMarkedMissing + b.cutsMarkedMissing,
    cutsRecovered: a.cutsRecovered + b.cutsRecovered
  }
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
  private flushing = false
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
   * Cancels any pending debounced flush.
   */
  suspend(): void {
    this.suspended = true
    this.debouncer.cancel()
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
        this.reconcile.execute(this.rootPath.value)
      } else {
        this.processGranular(collapsed)
      }

      this.notifier.notify('db-updated')

      // Enrich metadata for newly discovered entities (non-blocking)
      this.enrichMedia?.execute().catch((err) => console.error('[klip] Enrichment failed:', err))
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

  /**
   * Granular processing: classify events by creator and reconcile only affected creators.
   * Unknown paths are silently skipped (filtered by ChokidarWatcher anyway).
   */
  private processGranular(events: FileEvent[]): ReconcileResult {
    const affectedCreators = new Set<string>()

    for (const event of events) {
      const classification = classifyPath(this.rootPath.value, event.path)
      if (classification.kind !== 'unknown') {
        affectedCreators.add(classification.creatorName)
      }
    }

    let combined: ReconcileResult = {
      creatorsAdded: 0,
      creatorsMarkedMissing: 0,
      creatorsRecovered: 0,
      videosAdded: 0,
      videosMarkedMissing: 0,
      videosRecovered: 0,
      cutsAdded: 0,
      cutsMarkedMissing: 0,
      cutsRecovered: 0
    }

    for (const creatorName of affectedCreators) {
      const result = this.reconcile.executeForCreator(this.rootPath.value, creatorName)
      combined = mergeResults(combined, result)
    }

    return combined
  }
}
