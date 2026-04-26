import type { IVideoRepository } from '@domain/repositories'
import type { IVideoDownloader, IFileSystemReader, IPathResolver } from '@domain/ports'
import type { VideoDetailWithTranscript } from '@shared/types'
import { parseVtt } from '@domain/types'
import type { IFetchVideoDetail } from './IFetchVideoDetail'

/**
 * Fetch extended metadata + auto-transcript for a single video on demand.
 *
 * Persists the result onto the video entity (likeCount, tags, isShort, …,
 * transcriptPath, detailFetchedAt) and returns the parsed transcript text
 * to the caller.
 */
export class FetchVideoDetail implements IFetchVideoDetail {
  constructor(
    private videoRepo: IVideoRepository,
    private downloader: IVideoDownloader,
    private fsReader: IFileSystemReader,
    private pathResolver: IPathResolver
  ) {}

  async execute(videoId: string): Promise<VideoDetailWithTranscript> {
    const video = this.videoRepo.findById(videoId)
    if (!video) {
      throw new Error(`Video not found: ${videoId}`)
    }
    if (!video.url) {
      throw new Error(`Video has no URL — cannot fetch detail: ${videoId}`)
    }

    const detail = await this.downloader.fetchVideoDetail(video.url)

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
    } catch {
      // Transcript fetch is best-effort — leave null on failure
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
      detailFetchedAt: now,
      updatedAt: now
    })

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
      transcriptPath,
      transcriptText
    }
  }
}
