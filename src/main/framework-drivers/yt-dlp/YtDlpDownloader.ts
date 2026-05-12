import { spawn, type ChildProcess } from 'child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { isAbsolute, join } from 'path'
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
      // `--no-playlist` keeps yt-dlp focused on the single video even
      // when the URL carries a `&list=…` query (very common — every
      // "watch from playlist" link includes one). Without it, yt-dlp
      // walks every entry in the playlist and fails the whole call if
      // any item is region-blocked, members-only, etc.
      const args = ['--dump-json', '--no-download', '--no-playlist', '--no-warnings', url]
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
      // See fetchInfo for the `--no-playlist` rationale.
      const args = ['--dump-json', '--no-download', '--no-playlist', '--no-warnings', url]
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
        // See fetchInfo for the `--no-playlist` rationale.
        '--no-playlist',
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
        // See fetchInfo for the `--no-playlist` rationale.
        '--no-playlist',
        '--no-warnings',
        url
      ]
      const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })

      let stdout = ''
      let stderr = ''
      let settled = false

      // Comment scraping scales roughly linearly with the requested cap:
      // ~60-90s for 500 (yt-dlp baseline) and several minutes for tens of
      // thousands. The renderer exposes "Fetch all" up to 50K, so the
      // hardcoded 90s would kill any large fetch before the first half
      // arrived. Allow ~120ms per requested comment on top of a 60s
      // baseline, capped at 15 minutes so a buggy / unresponsive yt-dlp
      // can still be reaped.
      const timeoutMs = Math.min(15 * 60_000, 60_000 + maxComments * 120)
      const timeout = setTimeout(() => {
        if (settled) return
        settled = true
        proc.kill('SIGTERM')
        reject(
          new Error(
            `yt-dlp fetchComments: timed out after ${Math.round(timeoutMs / 1000)}s (max ${maxComments})`
          )
        )
      }, timeoutMs)

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
        // See fetchInfo for the `--no-playlist` rationale — the same
        // applies to a download invocation, otherwise yt-dlp would try
        // to download every entry in the playlist.
        '--no-playlist',
        // Format-sort to prefer H.264 video + M4A audio when available.
        // We still bias toward H.264 because (a) it has the broadest
        // editor / external-tool compatibility and (b) it ships at lower
        // bitrates than VP9/AV1 for the same visual quality. But the cap
        // is no longer "playable in Chromium" — see `--merge-output-format`
        // below — so when YouTube only offers VP9 / AV1 (4K, HDR, AV1-
        // experiment channels, audio-only Topic re-uploads, etc.) we
        // accept them and the merge step puts them in a container the
        // renderer can still play.
        '-S',
        'vcodec:h264,res,acodec:m4a,abr',
        // Container selection: prefer MP4, fall back to WebM. yt-dlp
        // picks the leftmost container whose codec constraints are
        // satisfied by the streams being merged:
        //   • H.264 (or H.265) + AAC → MP4
        //   • VP9 (or AV1) + Opus    → WebM
        //
        // Why not Matroska (.mkv): empirically — and against the earlier
        // research's claim — Chromium's HTML5 <video> rejects
        // `DocType=matroska` files outright with MEDIA_ERR_SRC_NOT_SUPPORTED
        // regardless of the MIME we serve. WebM is technically a
        // *constrained subset* of Matroska, so .mkv files that declare
        // `DocType=matroska` (which yt-dlp produces for all merged
        // outputs) cannot be passed off as `video/webm` either — the
        // demuxer reads the EBML DocType and rejects the cross-claim.
        // The only containers Chromium accepts in <video> are MP4 and
        // WebM proper. Picking per-codec means we never produce one
        // Chromium refuses.
        //
        // Why not just MP4: when YouTube only ships VP9/AV1 (4K, HDR,
        // some channels), merging into MP4 produces `codec_tag=vp09`
        // (or `av01`) which Chromium's MP4 demuxer rejects. WebM is
        // VP9/AV1's reference home; the demuxer never refuses VP9/AV1
        // in WebM.
        //
        // The `-S` format-sort above still biases toward H.264+AAC
        // where available, so most downloads land in MP4. WebM is only
        // chosen when YouTube genuinely doesn't offer the H.264 ladder
        // at the desired resolution.
        '--merge-output-format',
        'mp4/webm',
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
    let info: Record<string, unknown> | null = null

    if (existsSync(infoJsonPath)) {
      try {
        const raw = readFileSync(infoJsonPath, 'utf-8')
        info = JSON.parse(raw) as Record<string, unknown>
        title = (info.title as string) ?? (info.fulltitle as string) ?? videoId
        duration = (info.duration as number) ?? null
        creatorName = (info.channel as string) ?? (info.uploader as string) ?? ''
        channelId = (info.channel_id as string) ?? null
        channelUrl = (info.channel_url as string) ?? null
        subscriberCount = (info.channel_follower_count as number) ?? null
        viewCount = (info.view_count as number) ?? null

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

    const filePath = this.resolveMediaFilePath(outputDir, videoId, info)
    if (!filePath) {
      // Hard failure rather than silently storing the directory as the
      // video's filePath — that was the previous behaviour and it propagated
      // into ffprobe-on-a-directory crashes and broken playback. A clear
      // error here lets the caller mark the download as failed and the
      // user retry / inspect the output folder.
      throw new Error(
        `yt-dlp produced no recognisable media file in "${outputDir}". ` +
          `Check yt-dlp's output and your format selection.`
      )
    }

    const files = readdirSync(outputDir)
    const thumbnailFile =
      files.find((f: string) => /\.(jpg|jpeg|png|webp)$/i.test(f) && !f.includes('.info.')) ?? null

    return {
      downloadId,
      videoId,
      creatorName,
      filePath,
      title,
      duration,
      thumbnailPath: thumbnailFile ? join(outputDir, thumbnailFile) : null,
      channelId,
      channelUrl,
      subscriberCount,
      viewCount
    }
  }

  /**
   * Resolve the path to the downloaded media file, in priority order:
   *
   *   1. `info.requested_downloads[0].filepath` — yt-dlp's canonical
   *      post-merge output path. Available in yt-dlp ≥ 2022.04 and is
   *      the safest source because it accounts for format-merge target
   *      rewrites (e.g. mp4 → mkv when codec containers conflict).
   *   2. `info._filename` — legacy field on older yt-dlp builds.
   *   3. `info.filename` — used by some yt-dlp forks.
   *   4. Directory scan, restricted to media extensions and `<videoId>.`
   *      prefix first (matching the `-o` template), then any media file.
   *      The extension list is wider than before to cover formats that
   *      occasionally show up for YouTube (e.g. `.mov`, `.flv`, `.opus`,
   *      `.m4v`) and that the old regex silently dropped, leading to
   *      `filePath: <outputDir>` and downstream ffprobe failures.
   *
   * Each candidate is path-resolved against `outputDir` if relative, and
   * existence-checked. Returns null when nothing resolves — callers
   * surface that as a hard error.
   */
  private resolveMediaFilePath(
    outputDir: string,
    videoId: string,
    info: Record<string, unknown> | null
  ): string | null {
    const candidates: string[] = []
    if (info) {
      const requested = info.requested_downloads as Array<{ filepath?: unknown }> | undefined
      if (Array.isArray(requested) && typeof requested[0]?.filepath === 'string') {
        candidates.push(requested[0].filepath as string)
      }
      if (typeof info._filename === 'string') candidates.push(info._filename)
      if (typeof info.filename === 'string') candidates.push(info.filename as string)
    }
    for (const c of candidates) {
      const resolved = isAbsolute(c) ? c : join(outputDir, c)
      if (existsSync(resolved)) return resolved
    }

    // Broader extension list than the old check — see method JSDoc. The
    // `.part` exclusion stays so a half-finished download doesn't get
    // mistaken for a complete file.
    const MEDIA_EXT_RE =
      /\.(mp4|mkv|webm|m4a|mp3|mov|avi|flv|m4v|ts|opus|ogg|ogv|wmv|3gp|aac|wav)$/i
    const files = readdirSync(outputDir).filter((f) => !f.endsWith('.part'))
    // Prefer a file whose name matches the `-o ${videoId}.%(ext)s` template.
    const prefixHit = files.find((f) => f.startsWith(`${videoId}.`) && MEDIA_EXT_RE.test(f))
    if (prefixHit) return join(outputDir, prefixHit)
    const anyHit = files.find((f) => MEDIA_EXT_RE.test(f))
    return anyHit ? join(outputDir, anyHit) : null
  }
}
