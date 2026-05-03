import type { IVideoRepository } from '@domain/repositories'
import type { INotifier } from '@domain/ports'
import type { YoutubeErrorKind } from '@domain/types/youtube-error'
import type { IMarkVideoMissing } from './IMarkVideoMissing'

export class MarkVideoMissing implements IMarkVideoMissing {
  constructor(
    private videoRepo: IVideoRepository,
    private notifier: INotifier
  ) {}

  execute(
    videoId: string,
    reason: Extract<YoutubeErrorKind, 'unavailable' | 'unauthorized'>
  ): void {
    const video = this.videoRepo.findById(videoId)
    if (!video) return
    if (video.status === 'missing') return

    // The audited decorator captures the status diff in the audit log.
    // The `reason` parameter is intentionally not threaded into the audit
    // payload today — keeping the signature future-proofed without
    // expanding the audit-log schema. Operators rely on the timestamp
    // + the surrounding electron-log entries to attribute the cause.
    void reason
    this.videoRepo.updateStatus(videoId, 'missing', null)
    this.notifier.notify('db-updated', { scope: ['videos'] })
  }
}
