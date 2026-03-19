import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProcessFileNotifications, RECONCILE_THRESHOLD } from '@use-cases/ProcessFileNotifications'
import type { INotificationQueue, IDebouncer, INotifier } from '@domain/ports'
import type { FileEvent } from '@domain/types'
import type { ReconcileDirectory, ReconcileResult } from '@use-cases/ReconcileDirectory'

// ── Helpers ──

function makeEvent(path: string, type: FileEvent['type'] = 'add'): FileEvent {
  return { type, path }
}

function makeReconcileResult(overrides: Partial<ReconcileResult> = {}): ReconcileResult {
  return {
    creatorsAdded: 0,
    creatorsMarkedMissing: 0,
    creatorsRecovered: 0,
    videosAdded: 0,
    videosMarkedMissing: 0,
    videosRecovered: 0,
    cutsAdded: 0,
    cutsMarkedMissing: 0,
    cutsRecovered: 0,
    ...overrides
  }
}

function uniqueEvents(count: number): FileEvent[] {
  return Array.from({ length: count }, (_, i) => makeEvent(`/root/c/downloads/v${i}/video.mp4`))
}

describe('ProcessFileNotifications', () => {
  let mockQueue: INotificationQueue
  let mockDebouncer: IDebouncer
  let mockReconcile: ReconcileDirectory
  let mockNotifier: INotifier
  let useCase: ProcessFileNotifications

  beforeEach(() => {
    mockQueue = {
      enqueue: vi.fn(),
      drain: vi.fn<[], Promise<FileEvent[]>>().mockResolvedValue([]),
      size: vi.fn().mockReturnValue(0)
    }
    mockDebouncer = {
      schedule: vi.fn(),
      cancel: vi.fn()
    }
    mockReconcile = {
      execute: vi.fn().mockReturnValue(makeReconcileResult())
    } as unknown as ReconcileDirectory
    mockNotifier = {
      notify: vi.fn()
    }
    useCase = new ProcessFileNotifications(
      mockQueue,
      mockDebouncer,
      mockReconcile,
      mockNotifier,
      '/root',
      { debounceMs: 1000, reconcileThreshold: RECONCILE_THRESHOLD }
    )
  })

  // ── handleEvent ──

  describe('handleEvent', () => {
    it('enqueues the event', () => {
      const event = makeEvent('/root/c/downloads/v1/video.mp4')
      useCase.handleEvent(event)
      expect(mockQueue.enqueue).toHaveBeenCalledWith(event)
    })

    it('schedules a debounced flush', () => {
      useCase.handleEvent(makeEvent('/root/a'))
      expect(mockDebouncer.schedule).toHaveBeenCalledWith(expect.any(Function), 1000)
    })

    it('re-schedules debounce on each event', () => {
      useCase.handleEvent(makeEvent('/root/a'))
      useCase.handleEvent(makeEvent('/root/b'))
      useCase.handleEvent(makeEvent('/root/c'))
      expect(mockDebouncer.schedule).toHaveBeenCalledTimes(3)
    })
  })

  // ── flush (triggered via debouncer callback) ──

  describe('flush', () => {
    /** Extract the flush callback passed to the debouncer and invoke it */
    async function triggerFlush(): Promise<void> {
      useCase.handleEvent(makeEvent('/root/trigger'))
      const flushFn = vi.mocked(mockDebouncer.schedule).mock.calls[0][0]
      await flushFn()
    }

    it('calls reconcile when collapsed events < threshold', async () => {
      const events = uniqueEvents(5)
      vi.mocked(mockQueue.drain).mockResolvedValue(events)

      await triggerFlush()

      expect(mockReconcile.execute).toHaveBeenCalledWith('/root')
    })

    it('calls reconcile when collapsed events >= threshold', async () => {
      const events = uniqueEvents(RECONCILE_THRESHOLD + 10)
      vi.mocked(mockQueue.drain).mockResolvedValue(events)

      await triggerFlush()

      expect(mockReconcile.execute).toHaveBeenCalledWith('/root')
    })

    it('sends db-updated notification exactly once per flush', async () => {
      vi.mocked(mockQueue.drain).mockResolvedValue(uniqueEvents(3))

      await triggerFlush()

      expect(mockNotifier.notify).toHaveBeenCalledTimes(1)
      expect(mockNotifier.notify).toHaveBeenCalledWith('db-updated')
    })

    it('does NOT call reconcile or notify when all events collapse to IGNORE', async () => {
      // add + unlink on same path → IGNORE → empty after collapse
      vi.mocked(mockQueue.drain).mockResolvedValue([
        makeEvent('/root/f', 'add'),
        makeEvent('/root/f', 'unlink')
      ])

      await triggerFlush()

      expect(mockReconcile.execute).not.toHaveBeenCalled()
      expect(mockNotifier.notify).not.toHaveBeenCalled()
    })

    it('does NOT call reconcile or notify when buffer is empty', async () => {
      vi.mocked(mockQueue.drain).mockResolvedValue([])

      await triggerFlush()

      expect(mockReconcile.execute).not.toHaveBeenCalled()
      expect(mockNotifier.notify).not.toHaveBeenCalled()
    })
  })

  // ── Double-buffer: flushing flag ──

  describe('double-buffer behaviour', () => {
    it('does not schedule debounce while flushing', async () => {
      // First event triggers flush
      vi.mocked(mockQueue.drain).mockResolvedValue(uniqueEvents(2))
      useCase.handleEvent(makeEvent('/root/a'))
      const flushFn = vi.mocked(mockDebouncer.schedule).mock.calls[0][0]

      // Start flush (but don't await yet)
      const flushPromise = flushFn()

      // While flush is in progress, fire another event
      vi.mocked(mockDebouncer.schedule).mockClear()
      useCase.handleEvent(makeEvent('/root/b'))

      // Debouncer should NOT have been re-scheduled during flush
      expect(mockDebouncer.schedule).not.toHaveBeenCalled()

      await flushPromise
    })

    it('re-schedules debounce after flush if queue has pending events', async () => {
      vi.mocked(mockQueue.drain).mockResolvedValue(uniqueEvents(2))
      // After flush, size > 0 means new events arrived
      vi.mocked(mockQueue.size).mockReturnValue(3)

      useCase.handleEvent(makeEvent('/root/a'))
      const flushFn = vi.mocked(mockDebouncer.schedule).mock.calls[0][0]
      vi.mocked(mockDebouncer.schedule).mockClear()

      await flushFn()

      // Should have re-scheduled for the second cycle
      expect(mockDebouncer.schedule).toHaveBeenCalledWith(expect.any(Function), 1000)
    })

    it('does NOT re-schedule after flush if queue is empty', async () => {
      vi.mocked(mockQueue.drain).mockResolvedValue(uniqueEvents(2))
      vi.mocked(mockQueue.size).mockReturnValue(0)

      useCase.handleEvent(makeEvent('/root/a'))
      const flushFn = vi.mocked(mockDebouncer.schedule).mock.calls[0][0]
      vi.mocked(mockDebouncer.schedule).mockClear()

      await flushFn()

      expect(mockDebouncer.schedule).not.toHaveBeenCalled()
    })
  })

  // ── Error handling ──

  describe('error handling', () => {
    it('resets flushing flag even if reconcile throws', async () => {
      vi.mocked(mockQueue.drain).mockResolvedValue(uniqueEvents(2))
      vi.mocked(mockReconcile.execute).mockImplementation(() => {
        throw new Error('DB error')
      })

      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      useCase.handleEvent(makeEvent('/root/a'))
      const flushFn = vi.mocked(mockDebouncer.schedule).mock.calls[0][0]
      await flushFn()

      // After error, new handleEvent should still schedule (flushing = false)
      vi.mocked(mockDebouncer.schedule).mockClear()
      useCase.handleEvent(makeEvent('/root/b'))
      expect(mockDebouncer.schedule).toHaveBeenCalled()

      consoleSpy.mockRestore()
    })
  })
})
