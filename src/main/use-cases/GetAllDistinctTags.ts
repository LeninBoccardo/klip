import type { IVideoRepository, ICutRepository } from '@domain/repositories'
import type { TagAggregation } from '@shared/types'
import type { IGetAllDistinctTags } from './IGetAllDistinctTags'

export class GetAllDistinctTags implements IGetAllDistinctTags {
  constructor(
    private readonly videoRepo: IVideoRepository,
    private readonly cutRepo: ICutRepository
  ) {}

  execute(): TagAggregation[] {
    const merged = new Map<string, TagAggregation>()

    for (const { tag, count } of this.videoRepo.getAllDistinctTags()) {
      merged.set(tag, { tag, videoCount: count, cutCount: 0 })
    }

    for (const { tag, count } of this.cutRepo.getAllDistinctTags()) {
      const existing = merged.get(tag)
      if (existing) {
        existing.cutCount = count
      } else {
        merged.set(tag, { tag, videoCount: 0, cutCount: count })
      }
    }

    return Array.from(merged.values()).sort((a, b) => {
      const totalA = a.videoCount + a.cutCount
      const totalB = b.videoCount + b.cutCount
      if (totalA !== totalB) return totalB - totalA
      return a.tag.localeCompare(b.tag)
    })
  }
}
