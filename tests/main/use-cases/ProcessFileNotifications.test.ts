import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProcessFileNotifications, RECONCILE_THRESHOLD } from '@use-cases/ProcessFileNotifications'
import type { INotificationQueue, IDebouncer, INotifier } from '@domain/ports'
import type { FileEvent } from '@domain/types'
import type { IReconcileDirectory, ReconcileResult } from '@use-cases/IReconcileDirectory'

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
  let mockReconcile: IReconcileDirectory
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
    // executeForCreatorBatch delegates to executeForCreator (one call per name)
    // so existing per-creator assertions keep working without test churn.
    const executeForCreator = vi.fn().mockReturnValue(makeReconcileResult())
    mockReconcile = {
      execute: vi.fn().mockReturnValue(makeReconcileResult()),
      executeForCreator,
      executeForCreatorBatch: vi.fn((rootPath: string, names: string[]) => {
        let result = makeReconcileResult()
        for (const name of names) result = executeForCreator(rootPath, name) ?? result
        return result
      })
    }
    mockNotifier = {
      notify: vi.fn()
    }
    useCase = new ProcessFileNotifications(
      mockQueue,
      mockDebouncer,
      mockReconcile,
      mockNotifier,
      { value: '/root' },
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

    it('calls full reconcile when collapsed events >= threshold', async () => {
      const events = uniqueEvents(RECONCILE_THRESHOLD + 10)
      vi.mocked(mockQueue.drain).mockResolvedValue(events)

      await triggerFlush()

      expect(mockReconcile.execute).toHaveBeenCalledWith('/root')
      expect(mockReconcile.executeForCreator).not.toHaveBeenCalled()
    })

    it('sends db-updated notification exactly once per flush', async () => {
      vi.mocked(mockQueue.drain).mockResolvedValue(uniqueEvents(3))

      await triggerFlush()

      expect(mockNotifier.notify).toHaveBeenCalledTimes(1)
      expect(mockNotifier.notify).toHaveBeenCalledWith('db-updated', { scope: ['all'] })
    })

    // The flush short-circuit hinges on the collapse layer producing zero
    // surviving events. Each row exercises one of the IGNORE rules so a
    // regression that re-emits transient pairs can't slip past with a
    // file-event-only test.
    it.each([
      {
        name: 'add + unlink on same path (file)',
        events: [makeEvent('/root/f', 'add'), makeEvent('/root/f', 'unlink')]
      },
      {
        name: 'addDir + unlinkDir on same path',
        events: [makeEvent('/root/d', 'addDir'), makeEvent('/root/d', 'unlinkDir')]
      },
      {
        name: 'two independent IGNORE pairs on different paths',
        events: [
          makeEvent('/root/f1', 'add'),
          makeEvent('/root/f1', 'unlink'),
          makeEvent('/root/f2', 'add'),
          makeEvent('/root/f2', 'unlink')
        ]
      }
    ])(
      'does NOT call reconcile or notify when collapse erases everything ($name)',
      async ({ events }) => {
        vi.mocked(mockQueue.drain).mockResolvedValue(events)

        await triggerFlush()

        expect(mockReconcile.execute).not.toHaveBeenCalled()
        expect(mockReconcile.executeForCreator).not.toHaveBeenCalled()
        expect(mockNotifier.notify).not.toHaveBeenCalled()
      }
    )

    it('still reconciles for paths that survive collapse when other paths got erased', async () => {
      // Without this, the previous test's expectations would also pass for an
      // implementation that collapsed *everything* unconditionally — i.e. a
      // bug where the flush short-circuits even when surviving events exist.
      vi.mocked(mockQueue.drain).mockResolvedValue([
        // creatorA: add+unlink → IGNORE
        makeEvent('/root/creatorA/downloads/v1/file.mp4', 'add'),
        makeEvent('/root/creatorA/downloads/v1/file.mp4', 'unlink'),
        // creatorB: surviving change → must reconcile
        makeEvent('/root/creatorB/downloads/v2/file.mp4', 'change')
      ])

      await triggerFlush()

      expect(mockReconcile.executeForCreator).toHaveBeenCalledTimes(1)
      expect(mockReconcile.executeForCreator).toHaveBeenCalledWith('/root', 'creatorB')
    })

    it('does NOT call reconcile or notify when buffer is empty', async () => {
      vi.mocked(mockQueue.drain).mockResolvedValue([])

      await triggerFlush()

      expect(mockReconcile.execute).not.toHaveBeenCalled()
      expect(mockReconcile.executeForCreator).not.toHaveBeenCalled()
      expect(mockNotifier.notify).not.toHaveBeenCalled()
    })
  })

  // ── Granular processing (< threshold) ──

  describe('granular processing', () => {
    async function triggerFlush(): Promise<void> {
      useCase.handleEvent(makeEvent('/root/trigger'))
      const flushFn = vi.mocked(mockDebouncer.schedule).mock.calls[0][0]
      await flushFn()
    }

    it('calls executeForCreator for each affected creator when < threshold', async () => {
      vi.mocked(mockQueue.drain).mockResolvedValue([
        makeEvent('/root/creatorA/downloads/v1/video.mp4', 'add'),
        makeEvent('/root/creatorB/cuts/c1/cut.mp4', 'add')
      ])

      await triggerFlush()

      expect(mockReconcile.execute).not.toHaveBeenCalled()
      expect(mockReconcile.executeForCreator).toHaveBeenCalledTimes(2)
      expect(mockReconcile.executeForCreator).toHaveBeenCalledWith('/root', 'creatorA')
      expect(mockReconcile.executeForCreator).toHaveBeenCalledWith('/root', 'creatorB')
    })

    it('deduplicates creators: multiple events for same creator → single executeForCreator', async () => {
      vi.mocked(mockQueue.drain).mockResolvedValue([
        makeEvent('/root/creatorA/downloads/v1/video.mp4', 'add'),
        makeEvent('/root/creatorA/downloads/v2/video.mp4', 'add'),
        makeEvent('/root/creatorA/cuts/c1/cut.mp4', 'change')
      ])

      await triggerFlush()

      expect(mockReconcile.executeForCreator).toHaveBeenCalledTimes(1)
      expect(mockReconcile.executeForCreator).toHaveBeenCalledWith('/root', 'creatorA')
    })

    it('handles creator-level directory events', async () => {
      vi.mocked(mockQueue.drain).mockResolvedValue([makeEvent('/root/newCreator', 'addDir')])

      await triggerFlush()

      expect(mockReconcile.executeForCreator).toHaveBeenCalledWith('/root', 'newCreator')
    })

    it('skips unknown paths without error', async () => {
      vi.mocked(mockQueue.drain).mockResolvedValue([
        makeEvent('/root', 'change') // root itself → unknown
      ])

      await triggerFlush()

      expect(mockReconcile.executeForCreator).not.toHaveBeenCalled()
      // Should still notify since events existed (even if all unknown → no creators affected)
      // Actually, if no creators affected, no reconcile runs, but notify still fires since collapsed.length > 0
      expect(mockNotifier.notify).toHaveBeenCalledOnce()
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

    it('reschedules for events that arrived during an in-flight flush (post-null-flushPromise check)', async () => {
      // Defer the drain so handleEvent can fire while flush is mid-flight.
      let resolveDrain!: (events: FileEvent[]) => void
      const drainPromise = new Promise<FileEvent[]>((resolve) => {
        resolveDrain = resolve
      })
      vi.mocked(mockQueue.drain).mockReturnValueOnce(drainPromise)
      // queue.size() reports >0 only after the simulated late event arrives.
      let lateArrived = false
      vi.mocked(mockQueue.size).mockImplementation(() => (lateArrived ? 1 : 0))

      useCase.handleEvent(makeEvent('/root/a'))
      const flushFn = vi.mocked(mockDebouncer.schedule).mock.calls[0][0]
      const flushPromise = flushFn()
      vi.mocked(mockDebouncer.schedule).mockClear()

      // Simulate an event arriving during flush. handleEvent SHOULD NOT
      // schedule (flushPromise is non-null) — the post-flush check is what
      // must catch it.
      lateArrived = true
      useCase.handleEvent(makeEvent('/root/b'))
      expect(mockDebouncer.schedule).not.toHaveBeenCalled()

      // Let the flush complete. The outer .finally must see queue.size() > 0
      // and reschedule.
      resolveDrain([makeEvent('/root/a')])
      await flushPromise

      expect(mockDebouncer.schedule).toHaveBeenCalledWith(expect.any(Function), 1000)
    })

    it('lets in-flight flush complete when suspend fires mid-flush', async () => {
      // Defer the drain so we can interleave suspend() with an in-flight flush.
      let resolveDrain!: (events: FileEvent[]) => void
      const drainPromise = new Promise<FileEvent[]>((resolve) => {
        resolveDrain = resolve
      })
      vi.mocked(mockQueue.drain).mockReturnValueOnce(drainPromise)

      useCase.handleEvent(makeEvent('/root/trigger'))
      const flushFn = vi.mocked(mockDebouncer.schedule).mock.calls[0][0]
      const flushPromise = flushFn()

      // suspend() must wait on the in-flight flush before resolving — otherwise
      // a caller could observe `suspended === true` while a DB mutation was still
      // mid-flight, breaking the migrate-root invariant.
      let suspendResolved = false
      const suspendPromise = useCase.suspend().then(() => {
        suspendResolved = true
      })

      // After one microtask, neither promise has settled (drain is still pending).
      await Promise.resolve()
      expect(suspendResolved).toBe(false)
      expect(useCase.isSuspended()).toBe(true)

      resolveDrain([makeEvent('/root/c/downloads/v1/video.mp4')])
      await flushPromise
      await suspendPromise

      expect(suspendResolved).toBe(true)
      // The flush still ran to completion: notify fired, granular processing kicked in.
      expect(mockNotifier.notify).toHaveBeenCalledWith('db-updated', { scope: ['all'] })
      expect(mockReconcile.executeForCreator).toHaveBeenCalledWith('/root', 'c')
    })
  })

  // ── Error handling ──

  describe('error handling', () => {
    it('resets flushing flag even if reconcile throws', async () => {
      vi.mocked(mockQueue.drain).mockResolvedValue(uniqueEvents(RECONCILE_THRESHOLD + 1))
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

  // ── Suspend / Resume lifecycle ──

  describe('suspend / resume', () => {
    it('drops events when suspended', () => {
      useCase.suspend()
      useCase.handleEvent(makeEvent('/root/a'))
      useCase.handleEvent(makeEvent('/root/b'))

      expect(mockQueue.enqueue).not.toHaveBeenCalled()
      expect(mockDebouncer.schedule).not.toHaveBeenCalled()
    })

    it('cancels pending debounce on suspend', () => {
      useCase.handleEvent(makeEvent('/root/a'))
      useCase.suspend()

      expect(mockDebouncer.cancel).toHaveBeenCalledOnce()
    })

    it('drains stale events on resume', async () => {
      useCase.suspend()
      await useCase.resume()

      expect(mockQueue.drain).toHaveBeenCalledOnce()
    })

    it('accepts events again after resume', async () => {
      useCase.suspend()
      await useCase.resume()

      useCase.handleEvent(makeEvent('/root/a'))
      expect(mockQueue.enqueue).toHaveBeenCalledOnce()
      expect(mockDebouncer.schedule).toHaveBeenCalledOnce()
    })

    it('isSuspended tracks state correctly', async () => {
      expect(useCase.isSuspended()).toBe(false)

      useCase.suspend()
      expect(useCase.isSuspended()).toBe(true)

      await useCase.resume()
      expect(useCase.isSuspended()).toBe(false)
    })

    it('double-suspend is safe', () => {
      useCase.suspend()
      useCase.suspend()
      expect(useCase.isSuspended()).toBe(true)
      expect(mockDebouncer.cancel).toHaveBeenCalledTimes(2)
    })

    it('resume without suspend is safe', async () => {
      await useCase.resume()
      expect(useCase.isSuspended()).toBe(false)
    })
  })

  // ── Granular: mixed known + unknown paths ──

  describe('granular with mixed paths', () => {
    async function triggerFlush(): Promise<void> {
      useCase.handleEvent(makeEvent('/root/trigger'))
      const flushFn = vi.mocked(mockDebouncer.schedule).mock.calls[0][0]
      await flushFn()
    }

    it('processes only known creators, ignores unknown paths', async () => {
      vi.mocked(mockQueue.drain).mockResolvedValue([
        makeEvent('/root/creatorA/downloads/v1/video.mp4', 'add'),
        makeEvent('/root', 'change'), // unknown — root itself
        makeEvent('/root/creatorB/randomfile.txt', 'add') // unknown — unrecognised second segment
      ])

      await triggerFlush()

      expect(mockReconcile.executeForCreator).toHaveBeenCalledTimes(1)
      expect(mockReconcile.executeForCreator).toHaveBeenCalledWith('/root', 'creatorA')
    })

    it('notifies even when all events classify to unknown (collapsed.length > 0)', async () => {
      vi.mocked(mockQueue.drain).mockResolvedValue([
        makeEvent('/root', 'change') // unknown
      ])

      await triggerFlush()

      // No reconcile should run, but notify fires since collapsed is not empty
      expect(mockReconcile.executeForCreator).not.toHaveBeenCalled()
      expect(mockNotifier.notify).toHaveBeenCalledWith('db-updated', { scope: ['all'] })
    })
  })
})
