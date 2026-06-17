import type { IVideoRepository, ICutRepository } from '@domain/repositories'
import type { IMediaProbe, INotifier } from '@domain/ports'
import { redactPath, redactError } from '@domain/types/redact'
import type { IEnrichMediaMetadata, EnrichResult } from './IEnrichMediaMetadata'

/**
 * Probes all videos and cuts with `probeStatus = 'pending'` using ffprobe,
 * persists duration/resolution/fileSize, and flips probeStatus to 'complete'
 * (or 'failed' on error).
 *
 * Designed to run asynchronously after reconciliation discovers new entities.
 */
export class EnrichMediaMetadata implements IEnrichMediaMetadata {
  constructor(
    private videoRepo: IVideoRepository,
    private cutRepo: ICutRepository,
    private mediaProbe: IMediaProbe,
    private notifier: INotifier
  ) {}

  async execute(): Promise<EnrichResult> {
    const result: EnrichResult = { videosProbed: 0, cutsProbed: 0, failures: 0 }

    // Find entities needing probing
    const pendingVideos = this.videoRepo.findByProbeStatus('pending')
    const pendingCuts = this.cutRepo.findByProbeStatus('pending')

    // Probe videos
    for (const video of pendingVideos) {
      if (video.status !== 'active') continue
      try {
        const metadata = await this.mediaProbe.probe(video.filePath)
        // Column-scoped write (not a full upsert): the stale `video` snapshot
        // was read before the await, so re-writing every column would clobber
        // any concurrent change (FetchVideoDetail's viewCount/transcript,
        // MarkVideoMissing's status) that landed during the probe. Only touch
        // the probe-derived columns.
        this.videoRepo.updateProbeResult(video.id, {
          duration: metadata.duration ?? video.duration,
          resolution: metadata.resolution ?? video.resolution,
          fileSize: metadata.fileSize ?? video.fileSize,
          frameRate: metadata.frameRate ?? video.frameRate,
          probeStatus: 'complete'
        })
        result.videosProbed++
      } catch (err) {
        console.error(
          `[klip] ffprobe failed for video ${video.id} (${redactPath(video.filePath)}):`,
          redactError(err)
        )
        this.videoRepo.updateProbeStatus(video.id, 'failed')
        result.failures++
      }
    }

    // Probe cuts
    for (const cut of pendingCuts) {
      if (cut.status !== 'active') continue
      try {
        const metadata = await this.mediaProbe.probe(cut.filePath)
        // See the video loop: column-scoped write to avoid clobbering
        // concurrent mutations to the same cut row across the probe await.
        this.cutRepo.updateProbeResult(cut.id, {
          duration: metadata.duration ?? cut.duration,
          resolution: metadata.resolution ?? cut.resolution,
          fileSize: metadata.fileSize ?? cut.fileSize,
          probeStatus: 'complete'
        })
        result.cutsProbed++
      } catch (err) {
        console.error(
          `[klip] ffprobe failed for cut ${cut.id} (${redactPath(cut.filePath)}):`,
          redactError(err)
        )
        this.cutRepo.updateProbeStatus(cut.id, 'failed')
        result.failures++
      }
    }

    // Notify UI if anything changed — narrow the scope to the entity tables
    // that actually saw a probe-status change.
    if (result.videosProbed > 0 || result.cutsProbed > 0) {
      const scope: ('videos' | 'cuts')[] = []
      if (result.videosProbed > 0) scope.push('videos')
      if (result.cutsProbed > 0) scope.push('cuts')
      this.notifier.notify('db-updated', { scope })
    }

    return result
  }
}
