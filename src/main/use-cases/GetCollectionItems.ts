import type { ICollectionRepository, IVideoRepository, ICutRepository } from '@domain/repositories'
import type { CollectionItemDto } from '@shared/dtos'
import { toVideoDto, toCutDto } from '@main/interface-adapters/controllers/dto-mappers'
import type { IGetCollectionItems } from './IGetCollectionItems'

export class GetCollectionItems implements IGetCollectionItems {
  constructor(
    private readonly collectionRepo: ICollectionRepository,
    private readonly videoRepo: IVideoRepository,
    private readonly cutRepo: ICutRepository
  ) {}

  execute(collectionId: string): CollectionItemDto[] {
    const items = this.collectionRepo.getItems(collectionId)
    return items.map((item) => {
      if (item.kind === 'video') {
        const video = this.videoRepo.findById(item.id)
        return {
          kind: 'video',
          position: item.position,
          addedAt: item.addedAt,
          entity: video ? toVideoDto(video) : null
        }
      }
      const cut = this.cutRepo.findById(item.id)
      return {
        kind: 'cut',
        position: item.position,
        addedAt: item.addedAt,
        entity: cut ? toCutDto(cut) : null
      }
    })
  }
}
