import type { EditRecipe } from '@shared/types'

/**
 * Pure transformation `EditRecipe → ffmpeg argv`. No process I/O, no
 * filesystem access, no logging — every input that affects the result
 * is a function parameter so this is fully unit-testable.
 *
 * The actual spawn lives in `FfmpegRenderBackend`; the split is the
 * single most useful one for tests, since everything that can go wrong
 * with arg construction (mode selection, seek placement, container/
 * codec defaults, progress wiring) is verifiable by string-array
 * comparison without ever touching ffmpeg.
 *
 * Throws on unsupported ops rather than emitting an argv that would
 * silently produce wrong output. The use-case is expected to call
 * `IRenderBackend.canRender()` first and surface the reason; this
 * throw is the defence-in-depth gate.
 */
export function buildFfmpegArgv(
  recipe: EditRecipe,
  sourcePath: string,
  outputPath: string
): string[] {
  if (recipe.ops.length !== 1 || recipe.ops[0].type !== 'trim') {
    throw new Error(
      `FfmpegRenderBackend MVP only supports a single trim op; ` +
        `got ${recipe.ops.length} ops (first: ${recipe.ops[0]?.type ?? 'none'})`
    )
  }

  const trim = recipe.ops[0]
  const argv: string[] = []

  // ── Seek BEFORE -i for fast input-seek. With `-c copy` this snaps to
  //    the nearest keyframe ≤ trim.in (the documented quick-edit trade-off).
  //    With re-encode mode ffmpeg auto-falls-back to accurate seek (decode
  //    forward from the keyframe), so the same flag placement works for both.
  argv.push('-ss', formatSeconds(trim.in))
  argv.push('-to', formatSeconds(trim.out))
  argv.push('-i', sourcePath)

  if (recipe.output.mode === 'copy') {
    argv.push('-c', 'copy')
    // `-avoid_negative_ts make_zero` rebases timestamps so the trimmed
    // output starts at 0 rather than carrying the source's PTS offset
    // (which trips some players, esp. WebM in Chromium).
    argv.push('-avoid_negative_ts', 'make_zero')
    // Regenerates PTS on missing/duplicate timestamps; harmless if the
    // source is already well-formed, salvage for some yt-dlp-produced
    // muxes where the audio packets straddle the cut point.
    argv.push('-fflags', '+genpts')
  } else {
    // `medium` preset + CRF 18 ≈ visually-lossless H.264 / AAC. CRF
    // and preset are not user-tweakable in MVP — the only knob users
    // see is "fast (copy)" vs "precise (re-encode)". v2 may surface
    // them, but they don't belong in this layer.
    argv.push('-c:v', 'libx264', '-crf', '18', '-preset', 'medium')
    argv.push('-c:a', 'aac', '-b:a', '192k')
  }

  // ── Progress to stdout in machine-readable form for the backend's
  //    progress parser. `-nostats` silences the legacy "frame=… fps=…"
  //    banner so stdout stays clean key=value lines.
  argv.push('-progress', 'pipe:1', '-nostats')

  // Overwrite without prompting. The use case writes to a staging path
  // owned by the editor, so a stale file from a prior aborted render
  // should be overwritten, not refused.
  argv.push('-y', outputPath)

  return argv
}

/**
 * The expected output duration in seconds for a recipe; used by the
 * backend to compute progress as `out_time_us / total`. Returns 0 if
 * indeterminate (caller treats 0 as "don't divide" and just doesn't
 * emit progress).
 */
export function expectedOutputSeconds(recipe: EditRecipe): number {
  if (recipe.ops.length === 1 && recipe.ops[0].type === 'trim') {
    return Math.max(0, recipe.ops[0].out - recipe.ops[0].in)
  }
  return 0
}

// ffmpeg accepts `1:23.500` or plain seconds; bare seconds are clearer
// and trivial to test. Six decimal places gives microsecond precision,
// matching `out_time_us` and avoiding floor-rounding at the boundary.
function formatSeconds(s: number): string {
  return s.toFixed(6)
}
