import type { IVideoRepository } from '@domain/repositories'
import type { INotifier } from '@domain/ports'
import type { IMarkVideoActive } from './IMarkVideoActive'

export class MarkVideoActive implements IMarkVideoActive {
  constructor(
    private videoRepo: IVideoRepository,
    private notifier: INotifier
  ) {}

  execute(videoId: string): void {
    const video = this.videoRepo.findById(videoId)
    if (!video) return
    if (video.status !== 'missing') return

    this.videoRepo.updateStatus(videoId, 'active', null)
    this.notifier.notify('db-updated', { scope: ['videos'] })
  }
}
