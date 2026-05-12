import { spawn } from 'child_process'
import { statSync } from 'fs'
import type { IBinaryResolver } from '@domain/ports'
import type { MediaProbeResult } from '@domain/types'
import type { IMediaProbe } from '@domain/ports'

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
      fileSize: null
    }

    // Get file size from OS stat (more reliable than ffprobe for this)
    try {
      const stat = statSync(filePath)
      result.fileSize = stat.size
    } catch {
      // Non-fatal
    }

    // Spawn ffprobe for duration + resolution
    const ffprobeResult = await this.runFfprobe(bin, filePath)
    result.duration = ffprobeResult.duration
    result.resolution = ffprobeResult.resolution

    return result
  }

  private runFfprobe(
    bin: string,
    filePath: string
  ): Promise<{ duration: number | null; resolution: string | null }> {
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
        filePath
      ]

      const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
      })
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffprobe failed (code ${code}): ${stderr.trim()}`))
          return
        }

        try {
          const json = JSON.parse(stdout)
          const duration = json.format?.duration ? parseFloat(json.format.duration) : null

          // Find the video stream for resolution
          const videoStream = json.streams?.find(
            (s: { codec_type: string }) => s.codec_type === 'video'
          )
          const resolution =
            videoStream?.width && videoStream?.height
              ? `${videoStream.width}x${videoStream.height}`
              : null

          resolve({ duration, resolution })
        } catch (e) {
          reject(new Error(`ffprobe: failed to parse JSON output: ${e}`))
        }
      })

      proc.on('error', (err) => {
        reject(new Error(`Failed to spawn ffprobe: ${err.message}`))
      })
    })
  }
}
