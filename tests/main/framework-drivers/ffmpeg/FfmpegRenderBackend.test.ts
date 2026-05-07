import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import {
  FfmpegRenderBackend,
  parseProgressLine
} from '@main/framework-drivers/ffmpeg/FfmpegRenderBackend'
import type { IBinaryResolver } from '@domain/ports'
import type { EditOp, EditRecipe } from '@shared/types'

// Hoisted mock for child_process.spawn so the cancellation-ladder tests
// can drive a fake child process deterministically.
const { mockSpawn, lastChild } = vi.hoisted(() => {
  return {
    mockSpawn: vi.fn(),
    lastChild: { current: null as FakeChild | null }
  }
})

vi.mock('child_process', () => ({
  spawn: mockSpawn
}))

class FakeStdin extends EventEmitter {
  written: string[] = []
  ended = false
  write(data: string): boolean {
    this.written.push(data)
    return true
  }
  end(): void {
    this.ended = true
  }
}

class FakeChild extends EventEmitter {
  stdin = new FakeStdin()
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  killed = false
  killSignals: NodeJS.Signals[] = []
  kill(signal?: NodeJS.Signals | number): boolean {
    this.killSignals.push((signal as NodeJS.Signals) ?? 'SIGTERM')
    this.killed = true
    return true
  }
  /** Helper for tests — simulate the child exiting. */
  emitClose(code: number | null, signal: NodeJS.Signals | null = null): void {
    this.emit('close', code, signal)
  }
}

function mockResolver(): IBinaryResolver {
  return { resolve: vi.fn().mockReturnValue('/fake/ffmpeg') }
}

function trimRecipe(ops?: { in: number; out: number }): EditRecipe {
  return {
    version: 1,
    sourceVideoId: 'abc',
    ops: [{ type: 'trim', in: ops?.in ?? 0, out: ops?.out ?? 5 }],
    output: { container: 'mp4', mode: 'copy' }
  }
}

describe('FfmpegRenderBackend.canRender — forward-compat sentinel', () => {
  // This is the pinned contract from plan §10.2 — backends MUST reject
  // unknown ops with an explicit reason rather than silently dropping
  // them. A future SmartCutRenderBackend or WebCodecsRenderBackend
  // must satisfy the same shape; if this test is ever weakened to
  // accept reserved op types, the editor would happily render output
  // that's missing the requested effect.
  const reservedOps: EditOp[] = [
    { type: 'concat', segments: [{ sourceVideoId: 'a', in: 0, out: 1 }] },
    { type: 'mute' },
    { type: 'crop', x: 0, y: 0, w: 100, h: 100 },
    { type: 'speed', factor: 2 },
    { type: 'fade', durationMs: 200, kind: 'in' }
  ]

  it.each(reservedOps)('rejects reserved op type %#: $type', (op) => {
    const backend = new FfmpegRenderBackend(mockResolver())
    const recipe: EditRecipe = {
      version: 1,
      sourceVideoId: 'abc',
      ops: [op],
      output: { container: 'mp4', mode: 'copy' }
    }
    const result = backend.canRender(recipe)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toMatch(/single trim op/)
      // Surface the actual op types so a v2 author reading the failure
      // can tell which op the recipe carried.
      expect(result.reason).toContain(op.type)
    }
  })

  it('rejects multi-op recipes even if every op individually would be supported', () => {
    const backend = new FfmpegRenderBackend(mockResolver())
    const recipe: EditRecipe = {
      version: 1,
      sourceVideoId: 'abc',
      ops: [
        { type: 'trim', in: 0, out: 1 },
        { type: 'trim', in: 2, out: 3 }
      ],
      output: { container: 'mp4', mode: 'copy' }
    }
    expect(backend.canRender(recipe).ok).toBe(false)
  })

  it('accepts a single-trim recipe (the MVP-supported subset)', () => {
    const backend = new FfmpegRenderBackend(mockResolver())
    expect(backend.canRender(trimRecipe()).ok).toBe(true)
  })
})

describe('parseProgressLine', () => {
  it('emits 100% on `progress=end` regardless of total duration', () => {
    const onPercent = vi.fn()
    parseProgressLine('progress=end', 0, onPercent)
    expect(onPercent).toHaveBeenCalledWith(100)
  })

  it('computes percent from `out_time_us` against the total duration', () => {
    const onPercent = vi.fn()
    parseProgressLine('out_time_us=12500000', 25, onPercent)
    // 12.5s elapsed of 25s = 50%
    expect(onPercent).toHaveBeenCalledWith(50)
  })

  it('clamps overshoot at 100% (ffmpeg occasionally emits one frame past the end)', () => {
    const onPercent = vi.fn()
    parseProgressLine('out_time_us=30000000', 25, onPercent)
    expect(onPercent).toHaveBeenCalledWith(100)
  })

  it('drops below-zero `out_time_us` lines (treats them as malformed, not 0%)', () => {
    const onPercent = vi.fn()
    parseProgressLine('out_time_us=-1', 25, onPercent)
    // Negative elapsed time can't be real. Rather than emit a synthesised
    // 0%, the parser drops the line — the next valid line overwrites the
    // store's percent, so a single bad sample doesn't visibly affect the UI.
    expect(onPercent).not.toHaveBeenCalled()
  })

  it('skips `out_time_us` lines when total duration is unknown (no progress fraction)', () => {
    const onPercent = vi.fn()
    parseProgressLine('out_time_us=12500000', 0, onPercent)
    expect(onPercent).not.toHaveBeenCalled()
  })

  it('ignores unrelated key=value lines without throwing', () => {
    const onPercent = vi.fn()
    parseProgressLine('frame=42', 25, onPercent)
    parseProgressLine('fps=24', 25, onPercent)
    parseProgressLine('bitrate=1500.0kbits/s', 25, onPercent)
    parseProgressLine('speed=0.95x', 25, onPercent)
    expect(onPercent).not.toHaveBeenCalled()
  })

  it('ignores blank lines + lines without `=` (chunked-flush leftovers)', () => {
    const onPercent = vi.fn()
    parseProgressLine('', 25, onPercent)
    parseProgressLine('   ', 25, onPercent)
    parseProgressLine('garbage', 25, onPercent)
    parseProgressLine('=value-without-key', 25, onPercent)
    expect(onPercent).not.toHaveBeenCalled()
  })

  it('handles values containing `=` in the right-hand side', () => {
    // ffmpeg shouldn't actually emit this, but the parser should
    // split only on the first `=` so a future format change doesn't
    // crash the backend.
    const onPercent = vi.fn()
    parseProgressLine('progress=continue=extra', 25, onPercent)
    // `continue=extra` !== `end`, so 100% is not emitted; the line is
    // just dropped.
    expect(onPercent).not.toHaveBeenCalled()
  })
})

describe('FfmpegRenderBackend.render — pre-flight cancellation', () => {
  it('rejects with RenderCancelledError without spawning when the signal is already aborted', async () => {
    mockSpawn.mockClear()
    const backend = new FfmpegRenderBackend(mockResolver())
    const controller = new AbortController()
    controller.abort()

    const onProgress = vi.fn()
    await expect(
      backend.render(
        {
          recipe: trimRecipe(),
          sourcePath: '/fake/source.mp4',
          stagingPath: '/fake/staging.mp4'
        },
        { signal: controller.signal, onProgress }
      )
    ).rejects.toMatchObject({ name: 'RenderCancelledError' })
    expect(onProgress).not.toHaveBeenCalled()
    // Pre-flight short-circuit: must not even spawn.
    expect(mockSpawn).not.toHaveBeenCalled()
  })
})

describe('FfmpegRenderBackend.render — cancellation ladder (HP-4)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockSpawn.mockReset()
    mockSpawn.mockImplementation(() => {
      const child = new FakeChild()
      lastChild.current = child
      return child
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("writes 'q\\n' to stdin first so ffmpeg can flush moov before any kill", async () => {
    const backend = new FfmpegRenderBackend(mockResolver())
    const controller = new AbortController()
    const onProgress = vi.fn()

    const promise = backend.render(
      {
        recipe: trimRecipe(),
        sourcePath: '/fake/src.mp4',
        stagingPath: '/fake/staging.mp4'
      },
      { signal: controller.signal, onProgress }
    )

    // Spawn happened, child is live.
    expect(mockSpawn).toHaveBeenCalledTimes(1)
    const child = lastChild.current!
    expect(child.killSignals).toEqual([])

    // User clicks cancel. Step 1 of the ladder is synchronous.
    controller.abort()
    expect(child.stdin.written).toEqual(['q\n'])
    expect(child.stdin.ended).toBe(true)
    // No kill signal yet — graceful window is still open.
    expect(child.killSignals).toEqual([])

    // Simulate ffmpeg honouring 'q' and exiting before any timer fires.
    child.emitClose(0, null)
    await expect(promise).rejects.toMatchObject({ name: 'RenderCancelledError' })
    // Timers were cleared on close — no kill ever fired.
    expect(child.killSignals).toEqual([])
  })

  it('escalates to SIGTERM after the graceful window if the child is still running', async () => {
    const backend = new FfmpegRenderBackend(mockResolver())
    const controller = new AbortController()

    const promise = backend.render(
      {
        recipe: trimRecipe(),
        sourcePath: '/x',
        stagingPath: '/y'
      },
      { signal: controller.signal, onProgress: vi.fn() }
    )

    const child = lastChild.current!
    controller.abort()

    // Just under the graceful timeout — no SIGTERM yet.
    vi.advanceTimersByTime(1_999)
    expect(child.killSignals).toEqual([])

    // Cross the graceful threshold.
    vi.advanceTimersByTime(2)
    expect(child.killSignals).toContain('SIGTERM')

    // Simulate the SIGTERM landing.
    child.emitClose(null, 'SIGTERM')
    await expect(promise).rejects.toMatchObject({ name: 'RenderCancelledError' })
  })

  it('escalates to SIGKILL after the force window if the child ignores SIGTERM', async () => {
    const backend = new FfmpegRenderBackend(mockResolver())
    const controller = new AbortController()

    const promise = backend.render(
      {
        recipe: trimRecipe(),
        sourcePath: '/x',
        stagingPath: '/y'
      },
      { signal: controller.signal, onProgress: vi.fn() }
    )

    const child = lastChild.current!
    controller.abort()

    // Walk past both timers.
    vi.advanceTimersByTime(2_000)
    expect(child.killSignals).toContain('SIGTERM')

    vi.advanceTimersByTime(3_000)
    expect(child.killSignals).toContain('SIGKILL')

    // SIGKILL forces exit.
    child.emitClose(null, 'SIGKILL')
    await expect(promise).rejects.toMatchObject({ name: 'RenderCancelledError' })
  })

  it('clears all timers on a natural close (no kill on completion)', async () => {
    const backend = new FfmpegRenderBackend(mockResolver())
    const controller = new AbortController()

    const promise = backend.render(
      {
        recipe: trimRecipe({ in: 0, out: 1 }),
        sourcePath: '/x',
        stagingPath: '/y'
      },
      { signal: controller.signal, onProgress: vi.fn() }
    )

    const child = lastChild.current!
    // Render completes naturally without a cancel.
    child.emitClose(0, null)
    await expect(promise).resolves.toMatchObject({ durationMs: expect.any(Number) })

    // Even after the timer windows pass, no kill should fire — abort
    // never happened, so the timers were never armed.
    vi.advanceTimersByTime(10_000)
    expect(child.killSignals).toEqual([])
  })
})
