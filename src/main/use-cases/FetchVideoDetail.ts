import type { IVideoRepository } from '@domain/repositories'
import type { IVideoDownloader, IFileSystemReader, IPathResolver } from '@domain/ports'
import type { VideoDetailWithTranscript } from '@shared/types'
import { parseVtt } from '@domain/types'
import { redactError } from '@domain/types/redact'
import { classifyYoutubeError } from '@domain/types/youtube-error'
import type { IFetchVideoDetail } from './IFetchVideoDetail'
import type { IMarkVideoMissing } from './IMarkVideoMissing'
import type { IMarkVideoActive } from './IMarkVideoActive'

/**
 * Fetch extended metadata + auto-transcript for a single video on demand.
 *
 * Persists the result onto the video entity (likeCount, tags, isShort, …,
 * transcriptPath, detailFetchedAt) and returns the parsed transcript text
 * to the caller.
 *
 * On YouTube-side errors:
 *   - `unavailable` / `unauthorized` (404 / 403 / private / removed) →
 *     mark the video `'missing'` and rethrow, so the caller (enrichment
 *     loop / IPC handler) can decide whether to surface a toast.
 *   - `transient` / `unknown` → rethrow without status change so a
 *     network blip doesn't permanently flag the video.
 *
 * On success: if the video was previously `'missing'`, flip it back to
 * `'active'` (auto-recovery — the channel came back).
 */
export class FetchVideoDetail implements IFetchVideoDetail {
  constructor(
    private videoRepo: IVideoRepository,
    private downloader: IVideoDownloader,
    private fsReader: IFileSystemReader,
    private pathResolver: IPathResolver,
    private markMissing: IMarkVideoMissing,
    private markActive: IMarkVideoActive
  ) {}

  async execute(videoId: string): Promise<VideoDetailWithTranscript> {
    const video = this.videoRepo.findById(videoId)
    if (!video) {
      throw new Error(`Video not found: ${videoId}`)
    }
    if (!video.url) {
      throw new Error(`Video has no URL — cannot fetch detail: ${videoId}`)
    }

    let detail
    try {
      detail = await this.downloader.fetchVideoDetail(video.url)
    } catch (err) {
      const kind = classifyYoutubeError(err)
      // Narrow to the union MarkVideoMissing accepts. shouldMarkMissing is
      // the canonical predicate for that union — TS doesn't infer through
      // the helper, so split the branches manually.
      if (kind === 'unavailable' || kind === 'unauthorized') {
        console.warn(
          `[klip] YouTube ${kind} for video ${video.id}; marking missing:`,
          redactError(err)
        )
        this.markMissing.execute(video.id, kind)
      }
      throw err
    }

    // Transcripts are written next to the media file
    const videoDir = this.pathResolver.dirname(video.filePath)
    let transcriptPath: string | null = null
    let transcriptText: string | null = null
    try {
      transcriptPath = await this.downloader.fetchTranscript(video.url, videoDir, 'en')
      if (transcriptPath) {
        const raw = this.fsReader.readTextFile(transcriptPath)
        transcriptText = raw ? parseVtt(raw) : null
      }
    } catch (err) {
      // Transcript fetch is best-effort — log and leave null on failure so the
      // detail enrichment still commits.
      console.warn(`[klip] Transcript fetch failed for video ${video.id}:`, redactError(err))
      transcriptPath = null
      transcriptText = null
    }

    const now = new Date().toISOString()
    this.videoRepo.upsert({
      ...video,
      likeCount: detail.likeCount,
      dislikeCount: detail.dislikeCount,
      commentCount: detail.commentCount,
      viewCount: detail.viewCount ?? video.viewCount,
      category: detail.category,
      tags: detail.tags,
      uploadDate: detail.uploadDate,
      description: detail.description ?? video.description,
      isShort: detail.isShort,
      transcriptPath,
      transcriptText,
      detailFetchedAt: now,
      updatedAt: now
    })

    // Auto-recovery: if the video was previously flagged missing (likely
    // by an earlier YouTube 404/403), the successful fetch implies the
    // upstream is back. Flip it to active so the UI clears the badge.
    if (video.status === 'missing') {
      this.markActive.execute(video.id)
    }

    return {
      videoId: video.id,
      likeCount: detail.likeCount,
      dislikeCount: detail.dislikeCount,
      commentCount: detail.commentCount,
      viewCount: detail.viewCount,
      category: detail.category,
      tags: detail.tags,
      uploadDate: detail.uploadDate,
      description: detail.description,
      isShort: detail.isShort,
      hasTranscript: transcriptPath !== null,
      transcriptText
    }
  }
}
