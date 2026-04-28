import type { ICreatorRepository, IVideoRepository, ICutRepository } from '@domain/repositories'
import type { IResolveMediaUrl, ResolveMediaUrlInput } from './IResolveMediaUrl'

export class ResolveMediaUrl implements IResolveMediaUrl {
  constructor(
    private readonly creatorRepo: ICreatorRepository,
    private readonly videoRepo: IVideoRepository,
    private readonly cutRepo: ICutRepository
  ) {}

  resolve({ kind, id, asset }: ResolveMediaUrlInput): string | null {
    switch (kind) {
      case 'video': {
        const video = this.videoRepo.findById(id)
        if (!video) return null
        if (asset === 'file') return video.filePath
        if (asset === 'thumbnail') return video.thumbnailPath
        return null
      }
      case 'cut': {
        const cut = this.cutRepo.findById(id)
        if (!cut) return null
        if (asset === 'file') return cut.filePath
        if (asset === 'thumbnail') return cut.thumbnailPath
        return null
      }
      case 'creator': {
        const creator = this.creatorRepo.findById(id)
        if (!creator) return null
        if (asset === 'avatar') return creator.profileImagePath
        return null
      }
    }
  }
}
