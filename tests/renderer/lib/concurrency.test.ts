import { describe, it, expect, vi } from 'vitest'
import { mapWithConcurrency } from '@/lib/concurrency'

describe('mapWithConcurrency', () => {
  it('throws when limit is zero', async () => {
    await expect(mapWithConcurrency([1, 2], 0, async (n) => n)).rejects.toThrow('limit must be > 0')
  })

  it('throws when limit is negative', async () => {
    await expect(mapWithConcurrency([1, 2], -1, async (n) => n)).rejects.toThrow(
      'limit must be > 0'
    )
  })

  it('returns an empty array for an empty input', async () => {
    const result = await mapWithConcurrency<number, number>([], 4, async (n) => n)
    expect(result).toEqual([])
  })

  it('preserves input order even when work resolves out of order', async () => {
    const delays = [40, 5, 20, 60, 1]
    const result = await mapWithConcurrency(delays, 3, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms))
      return i
    })
    expect(result).toEqual([0, 1, 2, 3, 4])
  })

  it('forwards the index to the transform alongside the item', async () => {
    const fn = vi.fn(async (item: string) => item.toUpperCase())
    await mapWithConcurrency(['a', 'b', 'c'], 2, fn)
    expect(fn).toHaveBeenCalledWith('a', 0)
    expect(fn).toHaveBeenCalledWith('b', 1)
    expect(fn).toHaveBeenCalledWith('c', 2)
  })

  it('caps in-flight work at `limit` (never more than N concurrent)', async () => {
    let inflight = 0
    let peak = 0
    const items = Array.from({ length: 12 }, (_, i) => i)

    await mapWithConcurrency(items, 3, async () => {
      inflight++
      peak = Math.max(peak, inflight)
      await new Promise((r) => setTimeout(r, 5))
      inflight--
    })

    expect(peak).toBe(3)
  })

  it('clamps the worker count when `limit` exceeds `items.length`', async () => {
    // With 2 items and limit=10, only 2 workers should ever start. Track
    // start times — every task starts essentially together, never serialised.
    const starts: number[] = []
    const begin = Date.now()
    await mapWithConcurrency([0, 1], 10, async () => {
      starts.push(Date.now() - begin)
      await new Promise((r) => setTimeout(r, 10))
    })
    expect(starts.length).toBe(2)
    // Both workers start within a small window; the second is not waiting on
    // the first to finish.
    expect(starts[1] - starts[0]).toBeLessThan(8)
  })

  it('propagates a rejected promise (does not swallow errors)', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom on 2')
        return n
      })
    ).rejects.toThrow('boom on 2')
  })
})
