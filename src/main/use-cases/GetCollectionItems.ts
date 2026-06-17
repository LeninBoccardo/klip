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

    // Batch the two kinds into one query each (3 queries total) instead of a
    // findById per item (K+1). Stitch back by id into maps so the original
    // position order from getItems is preserved. (F43)
    const videoIds = items.filter((i) => i.kind === 'video').map((i) => i.id)
    const cutIds = items.filter((i) => i.kind === 'cut').map((i) => i.id)
    const videosById = new Map(this.videoRepo.findByIds(videoIds).map((v) => [v.id, v]))
    const cutsById = new Map(this.cutRepo.findByIds(cutIds).map((c) => [c.id, c]))

    return items.map((item) => {
      if (item.kind === 'video') {
        const video = videosById.get(item.id)
        return {
          kind: 'video',
          position: item.position,
          addedAt: item.addedAt,
          entity: video ? toVideoDto(video) : null
        }
      }
      const cut = cutsById.get(item.id)
      return {
        kind: 'cut',
        position: item.position,
        addedAt: item.addedAt,
        entity: cut ? toCutDto(cut) : null
      }
    })
  }
}
