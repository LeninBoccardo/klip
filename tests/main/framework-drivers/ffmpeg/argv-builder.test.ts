import { describe, it, expect } from 'vitest'
import {
  buildFfmpegArgv,
  expectedOutputSeconds
} from '@main/framework-drivers/ffmpeg/argv-builder'
import type { EditRecipe } from '@shared/types'

const SOURCE = '/library/creator/downloads/abc/abc.mp4'
const STAGING = '/library/.klip-render/cut-1.mp4'

function trimRecipe(opts: {
  in: number
  out: number
  mode: 'copy' | 'reencode'
  container?: 'mp4' | 'webm' | 'mkv'
}): EditRecipe {
  return {
    version: 1,
    sourceVideoId: 'abc',
    ops: [{ type: 'trim', in: opts.in, out: opts.out }],
    output: { container: opts.container ?? 'mp4', mode: opts.mode }
  }
}

describe('buildFfmpegArgv — trim, copy mode', () => {
  it('emits seek-before-input + stream-copy + safety flags + machine-readable progress', () => {
    const recipe = trimRecipe({ in: 12.5, out: 47, mode: 'copy' })
    const argv = buildFfmpegArgv(recipe, SOURCE, STAGING)

    expect(argv).toEqual([
      '-ss',
      '12.500000',
      '-to',
      '47.000000',
      '-i',
      SOURCE,
      '-c',
      'copy',
      // Rebases timestamps to 0 so trimmed output plays from the start
      // even when the source carries a non-zero PTS offset.
      '-avoid_negative_ts',
      'make_zero',
      // Fills in missing/duplicate PTS — salvage for some yt-dlp muxes
      // where audio packets straddle the cut point.
      '-fflags',
      '+genpts',
      '-progress',
      'pipe:1',
      '-nostats',
      '-y',
      STAGING
    ])
  })

  it('seeks before -i so the input demuxer fast-jumps to the keyframe', () => {
    const argv = buildFfmpegArgv(trimRecipe({ in: 0, out: 5, mode: 'copy' }), SOURCE, STAGING)
    const ssIdx = argv.indexOf('-ss')
    const iIdx = argv.indexOf('-i')
    expect(ssIdx).toBeGreaterThanOrEqual(0)
    expect(ssIdx).toBeLessThan(iIdx)
  })

  it('formats seconds with microsecond precision so trim points round-trip cleanly', () => {
    const argv = buildFfmpegArgv(
      trimRecipe({ in: 1.123456, out: 2.654321, mode: 'copy' }),
      SOURCE,
      STAGING
    )
    expect(argv).toContain('1.123456')
    expect(argv).toContain('2.654321')
  })
})

describe('buildFfmpegArgv — trim, re-encode mode', () => {
  it('emits libx264 + AAC at the documented MVP defaults', () => {
    const recipe = trimRecipe({ in: 10, out: 20, mode: 'reencode' })
    const argv = buildFfmpegArgv(recipe, SOURCE, STAGING)

    expect(argv).toContain('libx264')
    expect(argv).toContain('aac')
    expect(argv).toContain('-crf')
    expect(argv).toContain('18')
    expect(argv).toContain('-preset')
    expect(argv).toContain('medium')
    expect(argv).toContain('-b:a')
    expect(argv).toContain('192k')
    // The copy-mode safety flags are unnecessary when re-encoding —
    // ffmpeg regenerates timestamps from scratch.
    expect(argv).not.toContain('-avoid_negative_ts')
    expect(argv).not.toContain('+genpts')
  })

  it('still uses pre-input seek (auto-falls-back to accurate seek when re-encoding)', () => {
    const argv = buildFfmpegArgv(
      trimRecipe({ in: 5, out: 10, mode: 'reencode' }),
      SOURCE,
      STAGING
    )
    const ssIdx = argv.indexOf('-ss')
    const iIdx = argv.indexOf('-i')
    expect(ssIdx).toBeLessThan(iIdx)
  })
})

describe('buildFfmpegArgv — output options', () => {
  it('writes the output path last after `-y` (overwrite)', () => {
    const argv = buildFfmpegArgv(trimRecipe({ in: 0, out: 1, mode: 'copy' }), SOURCE, STAGING)
    expect(argv[argv.length - 1]).toBe(STAGING)
    expect(argv[argv.length - 2]).toBe('-y')
  })

  it('always pipes structured progress on stdout', () => {
    const argv = buildFfmpegArgv(trimRecipe({ in: 0, out: 1, mode: 'copy' }), SOURCE, STAGING)
    expect(argv).toContain('-progress')
    expect(argv).toContain('pipe:1')
    expect(argv).toContain('-nostats')
  })

  it('honours the container choice via the output extension only (codec/mode unchanged)', () => {
    const webm = buildFfmpegArgv(
      trimRecipe({ in: 0, out: 1, mode: 'copy', container: 'webm' }),
      SOURCE,
      '/x/cut.webm'
    )
    expect(webm).toContain('/x/cut.webm')
    // Container does not push different codec flags in MVP — the mode
    // is the only switch that matters at this layer.
    expect(webm).toContain('copy')
  })
})

describe('buildFfmpegArgv — forward-compat hard gate', () => {
  // The use-case is expected to call IRenderBackend.canRender() first;
  // this throw is the defence-in-depth gate against an unsupported op
  // accidentally producing wrong output. The test pins it so v2 ops
  // stay rejected at this layer until they're truly implemented.
  it('throws on a non-trim first op rather than silently degrading', () => {
    const recipe: EditRecipe = {
      version: 1,
      sourceVideoId: 'abc',
      ops: [{ type: 'mute' }],
      output: { container: 'mp4', mode: 'copy' }
    }
    expect(() => buildFfmpegArgv(recipe, SOURCE, STAGING)).toThrow(/single trim op/)
  })

  it('throws on multi-op recipes', () => {
    const recipe: EditRecipe = {
      version: 1,
      sourceVideoId: 'abc',
      ops: [
        { type: 'trim', in: 0, out: 1 },
        { type: 'trim', in: 2, out: 3 }
      ],
      output: { container: 'mp4', mode: 'copy' }
    }
    expect(() => buildFfmpegArgv(recipe, SOURCE, STAGING)).toThrow(/single trim op/)
  })
})

describe('expectedOutputSeconds', () => {
  it('returns out − in for a trim op', () => {
    expect(
      expectedOutputSeconds(trimRecipe({ in: 1.25, out: 4.75, mode: 'copy' }))
    ).toBeCloseTo(3.5, 6)
  })

  it('returns 0 for unsupported recipes (caller treats 0 as "no progress fraction available")', () => {
    const recipe: EditRecipe = {
      version: 1,
      sourceVideoId: 'abc',
      ops: [{ type: 'mute' }],
      output: { container: 'mp4', mode: 'copy' }
    }
    expect(expectedOutputSeconds(recipe)).toBe(0)
  })

  it('clamps negative durations to 0 (defence-in-depth against malformed recipes)', () => {
    expect(
      expectedOutputSeconds(trimRecipe({ in: 5, out: 4, mode: 'copy' }))
    ).toBe(0)
  })
})
