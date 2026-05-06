import { spawn } from 'child_process'
import type { IBinaryResolver } from '@domain/ports'
import type {
  IRenderBackend,
  RenderBackendContext,
  RenderBackendInput,
  RenderBackendResult
} from '@domain/ports'
import { RenderCancelledError } from '@domain/ports'
import type { EditRecipe } from '@shared/types'
import { isMvpSupportedRecipe } from '@shared/types'
import { buildFfmpegArgv, expectedOutputSeconds } from './argv-builder'

/**
 * MVP render backend. Spawns ffmpeg with an argv built by `argv-builder`
 * and parses `-progress pipe:1` lines for percent-complete updates.
 *
 * Cancellation: when `ctx.signal` aborts, the child is sent SIGTERM;
 * the close handler then rejects with `RenderCancelledError`. The use
 * case distinguishes cancellation from genuine failure by `instanceof`.
 *
 * The class deliberately holds no per-render state on `this` — each
 * render is a fresh closure. The caller (queue) is responsible for
 * not invoking `render()` twice in parallel against the same instance
 * if it wants serial behaviour; the backend itself is reentrant.
 */
export class FfmpegRenderBackend implements IRenderBackend {
  constructor(private readonly binaryResolver: IBinaryResolver) {}

  canRender(recipe: EditRecipe): { ok: true } | { ok: false; reason: string } {
    if (!isMvpSupportedRecipe(recipe)) {
      const opsList = recipe.ops.map((o) => o.type).join(', ')
      return {
        ok: false,
        reason: `Editor MVP supports a single trim op; got [${opsList}]`
      }
    }
    return { ok: true }
  }

  render(input: RenderBackendInput, ctx: RenderBackendContext): Promise<RenderBackendResult> {
    return new Promise((resolve, reject) => {
      // Defence in depth — argv-builder also throws, but rejecting an
      // already-aborted signal up front avoids spawning a process we'd
      // immediately kill.
      if (ctx.signal.aborted) {
        reject(new RenderCancelledError())
        return
      }

      const bin = this.binaryResolver.resolve('ffmpeg')
      const argv = buildFfmpegArgv(input.recipe, input.sourcePath, input.stagingPath)
      const totalSec = expectedOutputSeconds(input.recipe)
      const startedAt = Date.now()

      const proc = spawn(bin, argv, { stdio: ['ignore', 'pipe', 'pipe'] })

      let stderrTail = ''
      let stdoutBuffer = ''
      let lastReportedPercent = -1
      let aborted = false

      const onAbort = (): void => {
        aborted = true
        // SIGTERM — ffmpeg honours it cleanly and writes a final
        // progress=end line. SIGKILL would leak the partial mp4 with
        // no chance to finalise the moov atom.
        proc.kill('SIGTERM')
      }
      ctx.signal.addEventListener('abort', onAbort, { once: true })

      proc.stdout.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString()
        // ffmpeg flushes one key=value per line; a chunk may contain
        // partial lines, so buffer the tail and process complete ones.
        const lines = stdoutBuffer.split('\n')
        stdoutBuffer = lines.pop() ?? ''
        for (const line of lines) {
          parseProgressLine(line, totalSec, (pct) => {
            // Throttle to 0.5%-deltas — keeps the IPC channel quiet
            // without losing UX-relevant granularity. The renderer
            // animates between samples, so finer reporting is wasted.
            if (pct - lastReportedPercent >= 0.5 || pct >= 100) {
              lastReportedPercent = pct
              ctx.onProgress(pct)
            }
          })
        }
      })

      proc.stderr.on('data', (chunk: Buffer) => {
        // Keep only the last ~2KB of stderr — a long render's stderr
        // can be megabytes of progress garbage with the actual error
        // at the end. We surface only the tail in error messages.
        stderrTail = (stderrTail + chunk.toString()).slice(-2048)
      })

      proc.on('close', (code, signal) => {
        ctx.signal.removeEventListener('abort', onAbort)

        if (aborted || signal === 'SIGTERM') {
          reject(new RenderCancelledError())
          return
        }

        if (code !== 0) {
          reject(
            new Error(
              `ffmpeg exited with code ${code}` +
                (stderrTail.trim() ? `:\n${stderrTail.trim()}` : '')
            )
          )
          return
        }

        resolve({ durationMs: Date.now() - startedAt })
      })

      proc.on('error', (err) => {
        ctx.signal.removeEventListener('abort', onAbort)
        reject(new Error(`Failed to spawn ffmpeg: ${err.message}`))
      })
    })
  }
}

/**
 * Parse a single `key=value` line from ffmpeg's `-progress pipe:1`
 * output and call `onPercent` if the line yields a percent value.
 *
 * Exported for tests — the full progress block is a hassle to fixture
 * up around a real spawn, but verifying that
 * `out_time_us=12500000` + total=25 → 50.0 is one assertion.
 */
export function parseProgressLine(
  line: string,
  totalSec: number,
  onPercent: (pct: number) => void
): void {
  const trimmed = line.trim()
  if (!trimmed) return
  const eqIndex = trimmed.indexOf('=')
  if (eqIndex < 1) return
  const key = trimmed.slice(0, eqIndex)
  const value = trimmed.slice(eqIndex + 1)

  if (key === 'progress' && value === 'end') {
    onPercent(100)
    return
  }

  if (key === 'out_time_us' && totalSec > 0) {
    const us = parseInt(value, 10)
    if (Number.isFinite(us) && us >= 0) {
      const elapsedSec = us / 1_000_000
      const pct = Math.min(100, Math.max(0, (elapsedSec / totalSec) * 100))
      onPercent(pct)
    }
  }
}
