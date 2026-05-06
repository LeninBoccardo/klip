import { describe, it, expect, vi } from 'vitest'
import {
  FfmpegRenderBackend,
  parseProgressLine
} from '@main/framework-drivers/ffmpeg/FfmpegRenderBackend'
import type { IBinaryResolver } from '@domain/ports'
import type { EditOp, EditRecipe } from '@shared/types'

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
  })
})
