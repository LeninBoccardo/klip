import type { IVideoRepository, ISettingsRepository } from '@domain/repositories'
import type { IVideoDownloader, IFileSystemReader, IPathResolver } from '@domain/ports'
import type { VideoDetailWithTranscript, TranscriptFetchStatus } from '@shared/types'
import { DEFAULT_LANGUAGE, isLanguage } from '@shared/types'
import { parseVtt } from '@domain/types'
import { redactError } from '@domain/types/redact'
import { classifyYoutubeError } from '@domain/types/youtube-error'
import type { IFetchVideoDetail } from './IFetchVideoDetail'
import type { IMarkVideoMissing } from './IMarkVideoMissing'
import type { IMarkVideoActive } from './IMarkVideoActive'

/**
 * Build the language priority list passed to yt-dlp's `--sub-langs`.
 *
 * For English users we ask for `en` only. For everyone else we ask for the
 * user's locale first, English as a universal fallback, and finally `all`
 * so a video whose only auto-captions are in a third language (e.g. only
 * Japanese on an anime channel) still produces a transcript.
 */
export function buildTranscriptLanguagePriority(appLang: string): string[] {
  if (appLang === 'en') return ['en']
  return [appLang, 'en', 'all']
}

/**
 * Map a thrown transcript-fetch error to a coarse classification the UI
 * can act on. yt-dlp's stderr is our only signal; we look for distinctive
 * substrings rather than parsing structurally, because yt-dlp's wording
 * changes between versions and we just need three buckets.
 *
 *  - HTTP 429 / "Too Many Requests"  → 'rate-limited' (user can retry).
 *  - "no subtitles" / "There are no subtitles" → 'unavailable' (permanent).
 *  - anything else                   → 'error' (with a short message).
 */
function classifyTranscriptError(err: unknown): {
  status: Exclude<TranscriptFetchStatus, 'ok' | 'not-attempted'>
  message: string
} {
  const msg = err instanceof Error ? err.message : String(err)
  if (/HTTP Error 429|Too Many Requests/i.test(msg)) {
    return {
      status: 'rate-limited',
      message: 'YouTube rate-limited the request. Try again later.'
    }
  }
  if (/There are no subtitles|no.*subtitles/i.test(msg)) {
    return { status: 'unavailable', message: 'No subtitles available for this video.' }
  }
  // Trim to the first line so multi-line yt-dlp stderr doesn't blow up
  // the toast; keep ≤200 chars so the renderer can render it inline.
  const firstLine = msg.split('\n')[0].slice(0, 200)
  return { status: 'error', message: firstLine }
}

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
    private markActive: IMarkVideoActive,
    private settingsRepo: ISettingsRepository
  ) {}

  /**
   * Read the current UI language from settings, defaulting to English. The
   * value is the same locale string i18next uses (`'en'`, `'pt-BR'`, `'es'`),
   * so passing it through unchanged is safe — yt-dlp accepts the BCP-47
   * variants YouTube serves.
   */
  private resolveAppLanguage(): string {
    const raw = this.settingsRepo.get('language')
    return isLanguage(raw) ? raw : DEFAULT_LANGUAGE
  }

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
    let transcriptStatus: TranscriptFetchStatus = 'ok'
    let transcriptError: string | null = null
    try {
      const languagesPriority = buildTranscriptLanguagePriority(this.resolveAppLanguage())
      transcriptPath = await this.downloader.fetchTranscript(video.url, videoDir, languagesPriority)
      if (transcriptPath) {
        const raw = this.fsReader.readTextFile(transcriptPath)
        transcriptText = raw ? parseVtt(raw) : null
        if (transcriptText === null) {
          // We got a file but couldn't parse it — treat as a soft error so
          // the user sees something actionable rather than an empty tab.
          transcriptStatus = 'error'
          transcriptError = 'Subtitle file was downloaded but could not be parsed.'
        }
      } else {
        // yt-dlp's fetchTranscript returns null (not throw) when subs simply
        // don't exist — surface that as the permanent 'unavailable' state.
        transcriptStatus = 'unavailable'
        transcriptError = 'No subtitles available for this video.'
      }
    } catch (err) {
      // Transcript fetch is best-effort — log, classify, and leave the
      // text fields null so the detail enrichment still commits. The
      // status is what tells the renderer whether to offer a retry.
      console.warn(`[klip] Transcript fetch failed for video ${video.id}:`, redactError(err))
      const classified = classifyTranscriptError(err)
      transcriptStatus = classified.status
      transcriptError = classified.message
      transcriptPath = null
      transcriptText = null
    }

    const now = new Date().toISOString()
    // Column-scoped write (not a full-row upsert): EnrichMediaMetadata may be
    // probing this same row concurrently, and a full-row upsert from our stale
    // snapshot would clobber its just-written duration/resolution/fileSize. The
    // detail columns and probe columns are disjoint, so the two scoped writers
    // compose cleanly (F21).
    this.videoRepo.updateDetail(video.id, {
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
      detailFetchedAt: now
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
      transcriptText,
      transcriptStatus,
      transcriptError
    }
  }
}
