import type { EditRecipe } from '@shared/types'

/**
 * Pluggable render strategy. A backend takes a fully-resolved recipe
 * (source path + staging path already on the filesystem) and turns it
 * into an output media file at `stagingPath`.
 *
 * MVP ships `FfmpegRenderBackend` only. v2's `SmartCutRenderBackend`
 * (boundary-GOP re-encode + middle copy) and a hypothetical
 * `WebCodecsRenderBackend` slot in without touching `RenderCutFromVideo`
 * — the use case selects per recipe via `canRender()`.
 *
 * Cancellation is `AbortSignal`-based, not "kill this PID". Backends
 * translate the abort to whatever their underlying transport needs
 * (SIGTERM for ffmpeg, queue cancel for WebCodecs, etc.).
 */
export interface IRenderBackend {
  /**
   * Inspect a recipe and report whether this backend can produce its
   * output. Forward-compat contract: backends MUST reject unknown ops
   * with an explicit reason rather than silently dropping them. The
   * use-case picks the first backend that reports `ok: true`.
   */
  canRender(recipe: EditRecipe): { ok: true } | { ok: false; reason: string }

  render(input: RenderBackendInput, ctx: RenderBackendContext): Promise<RenderBackendResult>
}

export interface RenderBackendInput {
  recipe: EditRecipe
  /** Absolute path to the source video on disk (resolved by the use case). */
  sourcePath: string
  /** Absolute path to write the output to. Backend must overwrite if it exists. */
  stagingPath: string
}

export interface RenderBackendContext {
  /**
   * Called when progress can be computed against a known total. `percent`
   * is `0..100`. Backends that can't measure progress (e.g. WebCodecs
   * before the first frame is decoded) simply don't call this.
   */
  onProgress(percent: number): void
  /** Aborting the signal cancels the render. The backend rejects with a `RenderCancelledError`. */
  signal: AbortSignal
}

export interface RenderBackendResult {
  /** Wall-clock duration of the render in milliseconds. */
  durationMs: number
}

/**
 * Thrown by `render()` when the AbortSignal was triggered. Use-case
 * code distinguishes cancellation from genuine failure by checking
 * `instanceof RenderCancelledError`.
 */
export class RenderCancelledError extends Error {
  constructor(message = 'Render cancelled') {
    super(message)
    this.name = 'RenderCancelledError'
  }
}
