import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { VideoCommentsResult } from '@shared/types'

/**
 * Disk-backed cache for YouTube comments, keyed by videoId.
 *
 * Why a separate cache from the SQLite DB:
 *   - Comments are bulky (thousands of rows for popular videos) and
 *     have no first-class query needs in klip — they're show-and-forget.
 *   - YouTube rate-limits the comments endpoint aggressively (HTTP 429),
 *     so a 7-day cache buys us insulation from repeat-fetch churn when
 *     the user just flips back to the tab.
 *   - Living under `os.tmpdir()` makes the cache reset across reboots on
 *     some platforms, which is acceptable — fresh comments on a new
 *     session is fine, the goal is intra-session persistence.
 *
 * TTL:
 *   - 7 days from `fetchedAt`. Stale files are deleted on read.
 *
 * Concurrency:
 *   - Single-writer / single-reader process model. No locking. A torn
 *     write would be a malformed JSON file; `read()` catches parse
 *     errors and treats them as a cache miss.
 */
export interface ICommentsCache {
  /**
   * Returns the cached result for `videoId` if present AND not yet
   * expired. Returns null on miss, on expired hit (file is deleted),
   * on read/parse error, or on payload-shape mismatch.
   */
  read(videoId: string): VideoCommentsResult | null

  /**
   * Persists `result` under `videoId`. Overwrites any prior entry.
   * Failures are swallowed and logged — caching is best-effort and
   * must never abort the calling fetch operation.
   */
  write(result: VideoCommentsResult): void

  /**
   * Deletes the cache entry for `videoId`, if any. Used as a manual
   * invalidator (e.g. when the user explicitly hits Refresh and the
   * fresh fetch fails — we don't want to keep serving stale data).
   * No-op on miss.
   */
  invalidate(videoId: string): void
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Disk filename layout. videoId values come from yt-dlp (`/^[A-Za-z0-9_-]{1,64}$/`,
 * enforced in DownloadVideo) so they're always safe filename characters.
 * We still defensively reject anything that doesn't match the pattern
 * before touching the FS, so a poisoned id can't escape the cache dir.
 */
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

export class CommentsCache implements ICommentsCache {
  private readonly dir: string

  constructor(dir: string = join(tmpdir(), 'klip-comments')) {
    this.dir = dir
  }

  read(videoId: string): VideoCommentsResult | null {
    if (!VIDEO_ID_RE.test(videoId)) return null
    const file = this.pathFor(videoId)
    if (!existsSync(file)) return null

    try {
      const raw = readFileSync(file, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<VideoCommentsResult>
      if (!this.isValid(parsed)) {
        // Shape mismatch from an older app version or hand-edit.
        // Treat as expired and clean up so the next write starts fresh.
        this.safeDelete(file)
        return null
      }

      const fetchedAtMs = Date.parse(parsed.fetchedAt as string)
      if (!Number.isFinite(fetchedAtMs) || Date.now() - fetchedAtMs > TTL_MS) {
        this.safeDelete(file)
        return null
      }

      return {
        videoId: parsed.videoId as string,
        comments: parsed.comments as VideoCommentsResult['comments'],
        totalFetched: parsed.totalFetched as number,
        wasTruncated: parsed.wasTruncated as boolean,
        fetchedAt: parsed.fetchedAt as string,
        fromCache: true
      }
    } catch (err) {
      // Don't let a corrupt cache file break the read path.
      console.warn(
        `[CommentsCache] read failed for ${videoId}:`,
        err instanceof Error ? err.message : err
      )
      this.safeDelete(file)
      return null
    }
  }

  write(result: VideoCommentsResult): void {
    if (!VIDEO_ID_RE.test(result.videoId)) return
    try {
      mkdirSync(this.dir, { recursive: true })
      // Store with `fromCache: false` — the field is recomputed on read,
      // and shipping `true` here would lie about a fresh-fetch result.
      const payload: VideoCommentsResult = { ...result, fromCache: false }
      writeFileSync(this.pathFor(result.videoId), JSON.stringify(payload), 'utf-8')
    } catch (err) {
      console.warn(
        `[CommentsCache] write failed for ${result.videoId}:`,
        err instanceof Error ? err.message : err
      )
    }
  }

  invalidate(videoId: string): void {
    if (!VIDEO_ID_RE.test(videoId)) return
    this.safeDelete(this.pathFor(videoId))
  }

  private pathFor(videoId: string): string {
    return join(this.dir, `${videoId}.json`)
  }

  private safeDelete(file: string): void {
    try {
      rmSync(file, { force: true })
    } catch {
      // Best-effort cleanup; a leftover file is harmless.
    }
  }

  private isValid(p: Partial<VideoCommentsResult>): boolean {
    return (
      typeof p.videoId === 'string' &&
      Array.isArray(p.comments) &&
      typeof p.totalFetched === 'number' &&
      typeof p.wasTruncated === 'boolean' &&
      typeof p.fetchedAt === 'string'
    )
  }
}
