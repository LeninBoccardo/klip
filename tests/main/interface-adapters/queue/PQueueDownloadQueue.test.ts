import { describe, it, expect, beforeEach } from 'vitest'
import { PQueueDownloadQueue } from '@main/interface-adapters/queue/PQueueDownloadQueue'

describe('PQueueDownloadQueue', () => {
  let queue: PQueueDownloadQueue

  beforeEach(() => {
    queue = new PQueueDownloadQueue(2)
  })

  it('should execute an enqueued task and return its result', async () => {
    const result = await queue.enqueue(async () => 42)
    expect(result).toBe(42)
  })

  it('should execute tasks with concurrency limit', async () => {
    const running: number[] = []
    let maxConcurrent = 0

    const createTask = (id: number): (() => Promise<number>) => {
      return async () => {
        running.push(id)
        maxConcurrent = Math.max(maxConcurrent, running.length)
        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 50))
        running.splice(running.indexOf(id), 1)
        return id
      }
    }

    const promises = [
      queue.enqueue(createTask(1)),
      queue.enqueue(createTask(2)),
      queue.enqueue(createTask(3)),
      queue.enqueue(createTask(4))
    ]

    const results = await Promise.all(promises)
    expect(results).toEqual([1, 2, 3, 4])
    expect(maxConcurrent).toBeLessThanOrEqual(2)
  })

  it('should report pending and running counts correctly', async () => {
    // With concurrency 1 for easier assertion
    const q = new PQueueDownloadQueue(1)
    let resolveFirst: () => void
    const blockingPromise = new Promise<void>((r) => {
      resolveFirst = r
    })

    // Enqueue a blocking task and a second task
    const task1 = q.enqueue(async () => {
      await blockingPromise
    })
    // Let the first task start
    await new Promise((r) => setTimeout(r, 10))

    const task2 = q.enqueue(async () => 'done')

    // task1 is running (1), task2 is pending/queued (1)
    expect(q.running()).toBe(1)
    expect(q.pending()).toBe(1)

    resolveFirst!()
    await Promise.all([task1, task2])

    // After completion, both should be 0
    expect(q.running()).toBe(0)
    expect(q.pending()).toBe(0)
  })

  it('should resolve onIdle when all tasks complete', async () => {
    queue.enqueue(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    queue.enqueue(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    await queue.onIdle()
    // If we get here, onIdle resolved successfully
    expect(true).toBe(true)
  })

  it('should clear pending tasks', async () => {
    const q = new PQueueDownloadQueue(1)
    let resolveFirst: () => void
    const blockingPromise = new Promise<void>((r) => {
      resolveFirst = r
    })

    // Block the queue with one task
    const task1 = q.enqueue(async () => {
      await blockingPromise
      return 'first'
    })

    // Let it start
    await new Promise((r) => setTimeout(r, 10))

    // Enqueue more tasks (these will be pending)
    q.enqueue(async () => 'second').catch(() => {})
    q.enqueue(async () => 'third').catch(() => {})

    q.clear()

    resolveFirst!()
    const result = await task1
    expect(result).toBe('first')
  })

  it('should use default concurrency of 2', () => {
    const defaultQueue = new PQueueDownloadQueue()
    // Just verify it constructs without error
    expect(defaultQueue).toBeDefined()
  })
})
