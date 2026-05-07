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
 * Cancellation: HP-4 escalation ladder, designed to give ffmpeg the
 * best chance to finalise the moov atom while still guaranteeing the
 * process exits in bounded time:
 *
 *   1. Write `q\n` to ffmpeg's stdin — ffmpeg's interactive command
 *      parser interprets it as "quit gracefully" and writes a final
 *      `progress=end` line. Works on both POSIX and Windows.
 *   2. After GRACEFUL_TIMEOUT_MS, send SIGTERM (graceful on POSIX;
 *      `TerminateProcess` on Windows, since Node ignores the signal
 *      arg there).
 *   3. After FORCE_TIMEOUT_MS, send SIGKILL (forceful on POSIX;
 *      already-dead no-op on Windows after step 2).
 *
 * Without this ladder, a child stuck in I/O on POSIX would hang the
 * cancel UX indefinitely (no escalation), and on Windows every cancel
 * was silently SIGKILL via TerminateProcess regardless of the signal
 * name passed — leaving partial mp4s without a moov atom.
 *
 * The class deliberately holds no per-render state on `this` — each
 * render is a fresh closure. The caller (queue) is responsible for
 * not invoking `render()` twice in parallel against the same instance
 * if it wants serial behaviour; the backend itself is reentrant.
 */
const GRACEFUL_TIMEOUT_MS = 2_000
const FORCE_TIMEOUT_MS = 5_000

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

      // stdio[0] = 'pipe' so the abort handler can write `q\n` to
      // ffmpeg's interactive command channel. Without this it falls
      // straight to SIGTERM, which on Windows is `TerminateProcess`
      // (no chance to flush moov), and on POSIX hangs forever if the
      // child ignores the signal.
      const proc = spawn(bin, argv, { stdio: ['pipe', 'pipe', 'pipe'] })

      let stderrTail = ''
      let stdoutBuffer = ''
      let lastReportedPercent = -1
      let aborted = false
      // `closed` (NOT `proc.killed`) gates the escalation steps. Node sets
      // `proc.killed = true` after a signal is *sent*, not after the
      // process exits — using it would skip SIGKILL whenever SIGTERM was
      // already issued, even if the child kept running.
      let closed = false
      let gracefulTimer: ReturnType<typeof setTimeout> | null = null
      let forceTimer: ReturnType<typeof setTimeout> | null = null

      const clearTimers = (): void => {
        if (gracefulTimer) {
          clearTimeout(gracefulTimer)
          gracefulTimer = null
        }
        if (forceTimer) {
          clearTimeout(forceTimer)
          forceTimer = null
        }
      }

      const onAbort = (): void => {
        aborted = true
        // Step 1: graceful 'q' on stdin.
        try {
          proc.stdin?.write('q\n')
          proc.stdin?.end()
        } catch {
          // Stdin may already be closed (child crashed); fall through
          // to SIGTERM below.
        }
        // Step 2: SIGTERM if still alive after the graceful window.
        gracefulTimer = setTimeout(() => {
          if (!closed) proc.kill('SIGTERM')
        }, GRACEFUL_TIMEOUT_MS)
        // Step 3: SIGKILL escalation — the only guarantee that the
        // process eventually exits. On Windows step 2 already terminated
        // the process, so this is a defensive no-op there.
        forceTimer = setTimeout(() => {
          if (!closed) proc.kill('SIGKILL')
        }, FORCE_TIMEOUT_MS)
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
        closed = true
        ctx.signal.removeEventListener('abort', onAbort)
        clearTimers()

        if (aborted || signal === 'SIGTERM' || signal === 'SIGKILL') {
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
        closed = true
        ctx.signal.removeEventListener('abort', onAbort)
        clearTimers()
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
