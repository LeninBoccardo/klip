import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NodeDebouncer } from '@main/framework-drivers/timers/NodeDebouncer'

describe('NodeDebouncer', () => {
  let debouncer: NodeDebouncer

  beforeEach(() => {
    vi.useFakeTimers()
    debouncer = new NodeDebouncer()
  })

  afterEach(() => {
    debouncer.cancel()
    vi.useRealTimers()
  })

  it('fires the callback after the specified delay', () => {
    const cb = vi.fn()
    debouncer.schedule(cb, 500)

    expect(cb).not.toHaveBeenCalled()
    vi.advanceTimersByTime(500)
    expect(cb).toHaveBeenCalledOnce()
  })

  it('resets the timer on each schedule call', () => {
    const cb = vi.fn()
    debouncer.schedule(cb, 500)
    vi.advanceTimersByTime(400)
    debouncer.schedule(cb, 500) // reset
    vi.advanceTimersByTime(400)
    expect(cb).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(cb).toHaveBeenCalledOnce()
  })

  it('cancel prevents the callback from firing', () => {
    const cb = vi.fn()
    debouncer.schedule(cb, 500)
    debouncer.cancel()
    vi.advanceTimersByTime(1000)
    expect(cb).not.toHaveBeenCalled()
  })

  it('cancel is safe to call when no timer is pending', () => {
    expect(() => debouncer.cancel()).not.toThrow()
  })

  it('can schedule a new callback after cancel', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    debouncer.schedule(cb1, 500)
    debouncer.cancel()
    debouncer.schedule(cb2, 200)
    vi.advanceTimersByTime(200)
    expect(cb1).not.toHaveBeenCalled()
    expect(cb2).toHaveBeenCalledOnce()
  })
})
