import { spawn } from 'child_process'
import { statSync } from 'fs'
import type { IBinaryResolver } from '@domain/ports'
import type { MediaProbeResult } from '@domain/types'
import type { IMediaProbe } from '@domain/ports'

// ffprobe on a local file is normally sub-second; cap it so a stalled probe
// can't wedge the enrichment pipeline with a never-settling promise.
const FFPROBE_TIMEOUT_MS = 60_000

/**
 * Parse an ffprobe frame-rate rational ("num/den", e.g. "30000/1001") to fps.
 * Returns null for anything unusable: a non-string, a missing/zero denominator,
 * a zero numerator (ffprobe emits "0/0" for streams with no defined rate), or
 * non-finite parts. A bare integer string ("25") is treated as "25/1".
 */
function parseFrameRate(raw: unknown): number | null {
  if (typeof raw !== 'string') return null
  const [n, d] = raw.split('/')
  const num = Number(n)
  const den = d === undefined ? 1 : Number(d)
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0 || num === 0) return null
  return num / den
}

/**
 * ffprobe-backed implementation of IMediaProbe.
 *
 * Spawns ffprobe as a child process with JSON output,
 * parses the result for duration, resolution, and file size.
 */
export class FfprobeMediaProbe implements IMediaProbe {
  constructor(private binaryResolver: IBinaryResolver) {}

  async probe(filePath: string): Promise<MediaProbeResult> {
    const bin = this.binaryResolver.resolve('ffprobe')

    const result: MediaProbeResult = {
      duration: null,
      resolution: null,
      fileSize: null,
      frameRate: null
    }

    // Get file size from OS stat (more reliable than ffprobe for this)
    try {
      const stat = statSync(filePath)
      result.fileSize = stat.size
    } catch {
      // Non-fatal
    }

    // Spawn ffprobe for duration + resolution + frame rate
    const ffprobeResult = await this.runFfprobe(bin, filePath)
    result.duration = ffprobeResult.duration
    result.resolution = ffprobeResult.resolution
    result.frameRate = ffprobeResult.frameRate

    return result
  }

  private runFfprobe(
    bin: string,
    filePath: string
  ): Promise<{ duration: number | null; resolution: string | null; frameRate: number | null }> {
    return new Promise((resolve, reject) => {
      const args = [
        // `error` surfaces ffprobe's actual error message on stderr (e.g.
        // "Invalid data found when processing input" for a corrupted file,
        // or "No such file or directory" for a bogus path). `quiet`
        // suppressed everything and left the user with the unhelpful
        //   ffprobe failed (code 1):
        // with no payload — see logs/klip-dev.log.
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        // `--` terminates option parsing so a path beginning with a dash can't
        // be interpreted by ffprobe as an option (e.g. a protocol/input option).
        '--',
        filePath
      ]

      const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })

      let stdout = ''
      let stderr = ''
      let settled = false

      // Reaper: ffprobe on a local file is normally sub-second, but a
      // network/stalled FS (or a wedged binary) could hang the call forever,
      // blocking the enrichment pipeline. SIGTERM + reject after the cap.
      const timeout = setTimeout(() => {
        if (settled) return
        settled = true
        proc.kill('SIGTERM')
        reject(new Error(`ffprobe: timed out after ${FFPROBE_TIMEOUT_MS / 1000}s`))
      }, FFPROBE_TIMEOUT_MS)

      proc.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
      })
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })

      proc.on('close', (code) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        if (code !== 0) {
          reject(new Error(`ffprobe failed (code ${code}): ${stderr.trim()}`))
          return
        }

        try {
          const json = JSON.parse(stdout)
          const duration = json.format?.duration ? parseFloat(json.format.duration) : null

          // Find the video stream for resolution + frame rate
          const videoStream = json.streams?.find(
            (s: { codec_type: string }) => s.codec_type === 'video'
          )
          const resolution =
            videoStream?.width && videoStream?.height
              ? `${videoStream.width}x${videoStream.height}`
              : null

          // Prefer r_frame_rate (the stream's base/declared rate); fall back to
          // avg_frame_rate for containers that only report the average. Both are
          // "num/den" rationals; parseFrameRate handles "0/0" and bad values.
          const frameRate =
            parseFrameRate(videoStream?.r_frame_rate) ?? parseFrameRate(videoStream?.avg_frame_rate)

          resolve({ duration, resolution, frameRate })
        } catch (e) {
          reject(new Error(`ffprobe: failed to parse JSON output: ${e}`))
        }
      })

      proc.on('error', (err) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        reject(new Error(`Failed to spawn ffprobe: ${err.message}`))
      })
    })
  }
}
