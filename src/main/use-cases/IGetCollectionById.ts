import type { CollectionDto } from '@shared/dtos'

/** Returns a single collection enriched with `itemCount`, or null. */
export interface IGetCollectionById {
  execute(id: string): CollectionDto | null
}
