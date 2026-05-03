import type { ICutRepository, IVideoRepository } from '@domain/repositories'
import type { StorageStats } from '@shared/types'
import type { IGetStorageStats } from './IGetStorageStats'

export class GetStorageStats implements IGetStorageStats {
  constructor(
    private videoRepo: IVideoRepository,
    private cutRepo: ICutRepository
  ) {}

  execute(): StorageStats {
    const videosBytes = this.videoRepo.sumFileSize()
    const cutsBytes = this.cutRepo.sumFileSize()
    return {
      videosBytes,
      cutsBytes,
      totalBytes: videosBytes + cutsBytes
    }
  }
}
