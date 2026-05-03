import { spawn, type ChildProcess } from 'child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { IBinaryResolver, IVideoDownloader, DownloadOptions } from '@domain/ports'
import type { ChannelInfo, DownloadProgress, DownloadResult, VideoInfo } from '@domain/types'
import type { VideoComment, VideoDetail } from '@shared/types'
import { parseProgressLine, pickChannelAvatar } from './yt-dlp-helpers'

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
      // `--flat-playlist --dump-single-json --playlist-items 1` returns a
      // single playlist-shaped JSON for the channel (with channel-level
      // `thumbnails` containing the avatar in multiple sizes) plus one flat
      // entry. The previous per-video `--dump-json` call only exposed video
      // thumbnails, never the channel avatar.
      const args = [
        '--flat-playlist',
        '--dump-single-json',
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
            channelName: json.channel ?? json.uploader ?? json.title ?? '',
            channelUrl: json.channel_url ?? json.webpage_url ?? null,
            uploaderUrl: json.uploader_url ?? null,
            subscriberCount: json.channel_follower_count ?? null,
            avatarUrl: pickChannelAvatar(json.thumbnails)
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

  // ── fetchVideoDetail ──

  async fetchVideoDetail(url: string): Promise<Omit<VideoDetail, 'hasTranscript'>> {
    const bin = this.binaryResolver.resolve('yt-dlp')

    return new Promise((resolve, reject) => {
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
          reject(new Error(`yt-dlp fetchVideoDetail failed (code ${code}): ${stderr.trim()}`))
          return
        }
        try {
          const json = JSON.parse(stdout)
          const tags: string[] = Array.isArray(json.tags)
            ? json.tags.filter((t: unknown): t is string => typeof t === 'string')
            : []
          const categories: string[] = Array.isArray(json.categories) ? json.categories : []
          const duration = typeof json.duration === 'number' ? json.duration : null
          const width = typeof json.width === 'number' ? json.width : null
          const height = typeof json.height === 'number' ? json.height : null
          // YouTube Shorts: ≤ 60s and vertical aspect ratio
          const isShort =
            duration !== null &&
            duration <= 60 &&
            height !== null &&
            width !== null &&
            height > width
          // Normalize "20240315" → "2024-03-15"
          const uploadDate =
            typeof json.upload_date === 'string' && /^\d{8}$/.test(json.upload_date)
              ? `${json.upload_date.slice(0, 4)}-${json.upload_date.slice(4, 6)}-${json.upload_date.slice(6, 8)}`
              : (json.upload_date ?? null)

          resolve({
            videoId: json.id ?? '',
            likeCount: json.like_count ?? null,
            dislikeCount: json.dislike_count ?? null,
            commentCount: json.comment_count ?? null,
            viewCount: json.view_count ?? null,
            category: categories[0] ?? null,
            tags,
            uploadDate,
            description: json.description ?? null,
            isShort
          })
        } catch (e) {
          reject(new Error(`yt-dlp fetchVideoDetail: failed to parse JSON: ${e}`))
        }
      })

      proc.on('error', (err) => {
        reject(new Error(`yt-dlp fetchVideoDetail: failed to spawn: ${err.message}`))
      })
    })
  }

  // ── fetchTranscript ──

  async fetchTranscript(
    url: string,
    outputDir: string,
    lang: string = 'en'
  ): Promise<string | null> {
    const bin = this.binaryResolver.resolve('yt-dlp')
    const outputTemplate = join(outputDir, 'transcript')

    return new Promise((resolve, reject) => {
      const args = [
        '--write-auto-subs',
        '--sub-langs',
        lang,
        '--sub-format',
        'vtt',
        '--skip-download',
        '--no-warnings',
        '-o',
        outputTemplate,
        url
      ]
      const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })

      let stderr = ''
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })

      proc.on('close', (code) => {
        if (code !== 0) {
          // yt-dlp returns non-zero when no subs available; treat as null rather than throw
          if (stderr.includes('There are no subtitles')) {
            resolve(null)
            return
          }
          reject(new Error(`yt-dlp fetchTranscript failed (code ${code}): ${stderr.trim()}`))
          return
        }

        // yt-dlp writes <template>.<lang>.vtt
        try {
          const candidates = readdirSync(outputDir).filter(
            (f) => f.startsWith('transcript.') && f.endsWith('.vtt')
          )
          if (candidates.length === 0) {
            resolve(null)
            return
          }
          resolve(join(outputDir, candidates[0]))
        } catch (e) {
          reject(new Error(`yt-dlp fetchTranscript: failed to locate output: ${e}`))
        }
      })

      proc.on('error', (err) => {
        reject(new Error(`yt-dlp fetchTranscript: failed to spawn: ${err.message}`))
      })
    })
  }

  // ── fetchComments ──

  async fetchComments(
    url: string,
    maxComments: number = 500
  ): Promise<{ comments: VideoComment[]; wasTruncated: boolean }> {
    const bin = this.binaryResolver.resolve('yt-dlp')

    return new Promise((resolve, reject) => {
      const args = [
        '--dump-json',
        '--write-comments',
        '--extractor-args',
        `youtube:max_comments=${maxComments};comment_sort=top`,
        '--skip-download',
        '--no-warnings',
        url
      ]
      const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })

      let stdout = ''
      let stderr = ''
      let settled = false

      // Comment scraping can run long for popular videos. Cap at 90s.
      const timeout = setTimeout(() => {
        if (settled) return
        settled = true
        proc.kill('SIGTERM')
        reject(new Error('yt-dlp fetchComments: timed out after 90s'))
      }, 90_000)

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
          reject(new Error(`yt-dlp fetchComments failed (code ${code}): ${stderr.trim()}`))
          return
        }
        try {
          const json = JSON.parse(stdout)
          const raw: unknown[] = Array.isArray(json.comments) ? json.comments : []
          const comments: VideoComment[] = raw.map((c) => {
            const r = c as Record<string, unknown>
            const parent = typeof r.parent === 'string' ? r.parent : null
            return {
              id: typeof r.id === 'string' ? r.id : '',
              text: typeof r.text === 'string' ? r.text : '',
              author: typeof r.author === 'string' ? r.author : '',
              authorId: typeof r.author_id === 'string' ? r.author_id : null,
              likeCount: typeof r.like_count === 'number' ? r.like_count : 0,
              isPinned: r.is_pinned === true,
              parentId: parent === 'root' || parent === null ? null : parent,
              timestamp: typeof r.timestamp === 'number' ? r.timestamp : null
            }
          })
          // yt-dlp doesn't emit a truncation flag; best heuristic is that we
          // hit the cap exactly.
          const wasTruncated = comments.length >= maxComments
          resolve({ comments, wasTruncated })
        } catch (e) {
          reject(new Error(`yt-dlp fetchComments: failed to parse JSON: ${e}`))
        }
      })

      proc.on('error', (err) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        reject(new Error(`yt-dlp fetchComments: failed to spawn: ${err.message}`))
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
        // `--continue` resumes from the .part file when a previous attempt
        // for this output template was interrupted. `--no-overwrites` keeps
        // already-fetched sidecars (thumbnail, info.json) from being
        // re-downloaded on retry. Both are no-ops on a fresh download.
        '--continue',
        '--no-overwrites',
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
          const progress = parseProgressLine(line, downloadId, url)
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
