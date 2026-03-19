import { describe, it, expect, beforeEach } from 'vitest'
import { PQueueNotificationQueue } from '@main/interface-adapters/queue/PQueueNotificationQueue'
import type { FileEvent } from '@domain/types'

function ev(path: string, type: FileEvent['type'] = 'add'): FileEvent {
  return { type, path }
}

describe('PQueueNotificationQueue', () => {
  let queue: PQueueNotificationQueue

  beforeEach(() => {
    queue = new PQueueNotificationQueue()
  })

  it('starts with size 0', () => {
    expect(queue.size()).toBe(0)
  })

  it('enqueue increases size', () => {
    queue.enqueue(ev('/a'))
    queue.enqueue(ev('/b'))
    expect(queue.size()).toBe(2)
  })

  it('drain returns all buffered events', async () => {
    queue.enqueue(ev('/a'))
    queue.enqueue(ev('/b'))
    queue.enqueue(ev('/c'))

    const events = await queue.drain()

    expect(events).toEqual([ev('/a'), ev('/b'), ev('/c')])
  })

  it('drain resets size to 0', async () => {
    queue.enqueue(ev('/a'))
    queue.enqueue(ev('/b'))

    await queue.drain()

    expect(queue.size()).toBe(0)
  })

  it('drain on empty buffer returns empty array', async () => {
    const events = await queue.drain()
    expect(events).toEqual([])
  })

  it('events enqueued after drain go to new buffer', async () => {
    queue.enqueue(ev('/a'))
    const first = await queue.drain()

    queue.enqueue(ev('/b'))
    queue.enqueue(ev('/c'))
    const second = await queue.drain()

    expect(first).toEqual([ev('/a')])
    expect(second).toEqual([ev('/b'), ev('/c')])
  })

  it('multiple drains return disjoint snapshots', async () => {
    queue.enqueue(ev('/1'))
    queue.enqueue(ev('/2'))
    const batch1 = await queue.drain()

    queue.enqueue(ev('/3'))
    const batch2 = await queue.drain()

    const batch3 = await queue.drain()

    expect(batch1).toEqual([ev('/1'), ev('/2')])
    expect(batch2).toEqual([ev('/3')])
    expect(batch3).toEqual([])
  })

  it('preserves event insertion order', async () => {
    const paths = Array.from({ length: 100 }, (_, i) => `/path/${i}`)
    for (const p of paths) {
      queue.enqueue(ev(p))
    }

    const events = await queue.drain()

    expect(events.map((e) => e.path)).toEqual(paths)
  })
})
