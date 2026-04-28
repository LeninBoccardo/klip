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
        this.videoRepo.upsert({
          ...video,
          duration: metadata.duration ?? video.duration,
          resolution: metadata.resolution ?? video.resolution,
          fileSize: metadata.fileSize ?? video.fileSize,
          probeStatus: 'complete',
          updatedAt: new Date().toISOString()
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
        this.cutRepo.upsert({
          ...cut,
          duration: metadata.duration ?? cut.duration,
          resolution: metadata.resolution ?? cut.resolution,
          fileSize: metadata.fileSize ?? cut.fileSize,
          probeStatus: 'complete',
          updatedAt: new Date().toISOString()
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

    // Notify UI if anything changed
    if (result.videosProbed > 0 || result.cutsProbed > 0) {
      this.notifier.notify('db-updated')
    }

    return result
  }
}
