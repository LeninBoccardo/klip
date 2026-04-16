import { spawn, type ChildProcess } from 'child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { IBinaryResolver, IVideoDownloader, DownloadOptions } from '@domain/ports'
import type { ChannelInfo, DownloadProgress, DownloadResult, VideoInfo } from '@domain/types'

/**
 * yt-dlp–backed implementation of IVideoDownloader.
 *
 * Spawns yt-dlp as a child process, parses its stdout for real-time progress,
 * and stores active process handles for cancellation support.
 */
export class YtDlpDownloader implements IVideoDownloader {
  private readonly activeProcesses = new Map<string, ChildProcess>()

  constructor(private binaryResolver: IBinaryResolver) {}

  // ── fetchInfo ──

  async fetchInfo(url: string): Promise<VideoInfo> {
    const bin = this.binaryResolver.resolve('yt-dlp')

    return new Promise<VideoInfo>((resolve, reject) => {
      const args = ['--dump-json', '--no-download', '--no-warnings', url]
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
          reject(new Error(`yt-dlp fetchInfo failed (code ${code}): ${stderr.trim()}`))
          return
        }

        try {
          const json = JSON.parse(stdout)
          resolve({
            videoId: json.id ?? '',
            title: json.title ?? json.fulltitle ?? '',
            channel: json.channel ?? json.uploader ?? null,
            duration: json.duration ?? null,
            thumbnailUrl: json.thumbnail ?? null,
            description: json.description ?? null,
            // ── Channel metadata ──
            channelId: json.channel_id ?? null,
            channelUrl: json.channel_url ?? null,
            uploaderUrl: json.uploader_url ?? null,
            subscriberCount: json.channel_follower_count ?? null,
            viewCount: json.view_count ?? null
          })
        } catch (e) {
          reject(new Error(`yt-dlp fetchInfo: failed to parse JSON output: ${e}`))
        }
      })

      proc.on('error', (err) => {
        reject(new Error(`yt-dlp fetchInfo: failed to spawn process: ${err.message}`))
      })
    })
  }

  // ── fetchChannelInfo ──

  async fetchChannelInfo(channelUrl: string): Promise<ChannelInfo> {
    const bin = this.binaryResolver.resolve('yt-dlp')

    return new Promise<ChannelInfo>((resolve, reject) => {
      const args = [
        '--dump-json',
        '--playlist-items',
        '1',
        '--no-download',
        '--no-warnings',
        channelUrl
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
          reject(new Error(`yt-dlp fetchChannelInfo failed (code ${code}): ${stderr.trim()}`))
          return
        }

        try {
          const json = JSON.parse(stdout)
          resolve({
            channelId: json.channel_id ?? '',
            channelName: json.channel ?? json.uploader ?? '',
            channelUrl: json.channel_url ?? null,
            uploaderUrl: json.uploader_url ?? null,
            subscriberCount: json.channel_follower_count ?? null,
            avatarUrl: null
          })
        } catch (e) {
          reject(new Error(`yt-dlp fetchChannelInfo: failed to parse JSON: ${e}`))
        }
      })

      proc.on('error', (err) => {
        reject(new Error(`yt-dlp fetchChannelInfo: failed to spawn: ${err.message}`))
      })
    })
  }

  // ── download ──

  async download(
    options: DownloadOptions,
    onProgress: (progress: DownloadProgress) => void
  ): Promise<DownloadResult> {
    const bin = this.binaryResolver.resolve('yt-dlp')
    const { url, outputDir, videoId, downloadId } = options

    // Notify queued → downloading
    onProgress({
      downloadId,
      url,
      percent: 0,
      speed: null,
      eta: null,
      status: 'downloading'
    })

    return new Promise<DownloadResult>((resolve, reject) => {
      const args = [
        '--newline',
        '--no-warnings',
        '--progress-template',
        '%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
        '--write-thumbnail',
        '--write-info-json',
        '--convert-thumbnails',
        'jpg',
        '-o',
        `${outputDir}/${videoId}.%(ext)s`,
        url
      ]

      const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
      this.activeProcesses.set(downloadId, proc)

      let stderr = ''

      proc.stdout.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(Boolean)
        for (const line of lines) {
          const progress = this.parseProgressLine(line, downloadId, url)
          if (progress) {
            onProgress(progress)
          }
        }
      })

      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })

      proc.on('close', (code, signal) => {
        this.activeProcesses.delete(downloadId)

        if (signal === 'SIGTERM' || signal === 'SIGKILL') {
          onProgress({
            downloadId,
            url,
            percent: 0,
            speed: null,
            eta: null,
            status: 'cancelled'
          })
          reject(new Error('Download cancelled'))
          return
        }

        if (code !== 0) {
          onProgress({
            downloadId,
            url,
            percent: 0,
            speed: null,
            eta: null,
            status: 'error'
          })
          reject(new Error(`yt-dlp download failed (code ${code}): ${stderr.trim()}`))
          return
        }

        // Notify processing (post-download — reading info JSON)
        onProgress({
          downloadId,
          url,
          percent: 100,
          speed: null,
          eta: null,
          status: 'processing'
        })

        // Build result from yt-dlp's info JSON
        try {
          const result = this.buildResult(outputDir, videoId, downloadId, url)
          onProgress({
            downloadId,
            url,
            percent: 100,
            speed: null,
            eta: null,
            status: 'complete'
          })
          resolve(result)
        } catch (e) {
          reject(new Error(`yt-dlp post-processing failed: ${e}`))
        }
      })

      proc.on('error', (err) => {
        this.activeProcesses.delete(downloadId)
        onProgress({
          downloadId,
          url,
          percent: 0,
          speed: null,
          eta: null,
          status: 'error'
        })
        reject(new Error(`Failed to spawn yt-dlp: ${err.message}`))
      })
    })
  }

  // ── cancel ──

  cancel(downloadId: string): void {
    const proc = this.activeProcesses.get(downloadId)
    if (proc) {
      proc.kill('SIGTERM')
      this.activeProcesses.delete(downloadId)
    }
  }

  // ── Private helpers ──

  /**
   * Parse a yt-dlp progress template line.
   * Expected format: "  42.5%|  2.50MiB/s|00:15"
   */
  private parseProgressLine(
    line: string,
    downloadId: string,
    url: string
  ): DownloadProgress | null {
    const parts = line.split('|')
    if (parts.length < 3) return null

    const percentStr = parts[0].trim().replace('%', '')
    const percent = parseFloat(percentStr)
    if (isNaN(percent)) return null

    const speed = parts[1]?.trim() || null
    const eta = parts[2]?.trim() || null

    return {
      downloadId,
      url,
      percent,
      speed: speed === 'N/A' ? null : speed,
      eta: eta === 'N/A' ? null : eta,
      status: 'downloading'
    }
  }

  /**
   * Read the yt-dlp info JSON written alongside the downloaded file
   * and construct a DownloadResult.
   */
  private buildResult(
    outputDir: string,
    videoId: string,
    downloadId: string,
    url: string
  ): DownloadResult {
    // yt-dlp writes <videoId>.info.json in the output directory
    const infoJsonPath = join(outputDir, `${videoId}.info.json`)
    let title = videoId
    let duration: number | null = null
    let creatorName = ''
    let channelId: string | null = null
    let channelUrl: string | null = null
    let subscriberCount: number | null = null
    let viewCount: number | null = null

    if (existsSync(infoJsonPath)) {
      try {
        const raw = readFileSync(infoJsonPath, 'utf-8')
        const info = JSON.parse(raw)
        title = info.title ?? info.fulltitle ?? videoId
        duration = info.duration ?? null
        creatorName = info.channel ?? info.uploader ?? ''
        channelId = info.channel_id ?? null
        channelUrl = info.channel_url ?? null
        subscriberCount = info.channel_follower_count ?? null
        viewCount = info.view_count ?? null

        // Write meta.json for reconciliation compatibility
        const metaPath = join(outputDir, 'meta.json')
        const meta = {
          url,
          title,
          duration,
          downloadDate: new Date().toISOString()
        }
        writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
      } catch {
        // Non-fatal — continue with defaults
      }
    }

    // Find the downloaded media file (exclude .json and .part files)
    const files = readdirSync(outputDir)
    const mediaFile =
      files.find((f: string) => /\.(mp4|mkv|webm|m4a|mp3)$/i.test(f) && !f.endsWith('.part')) ??
      null

    const thumbnailFile =
      files.find((f: string) => /\.(jpg|jpeg|png|webp)$/i.test(f) && !f.includes('.info.')) ?? null

    return {
      downloadId,
      videoId,
      creatorName,
      filePath: mediaFile ? join(outputDir, mediaFile) : outputDir,
      title,
      duration,
      thumbnailPath: thumbnailFile ? join(outputDir, thumbnailFile) : null,
      channelId,
      channelUrl,
      subscriberCount,
      viewCount
    }
  }
}
