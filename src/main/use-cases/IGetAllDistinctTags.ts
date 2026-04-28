import type { TagAggregation } from '@shared/types'

/**
 * Returns the distinct tag set across all active videos and cuts, with
 * per-table counts. Backs both the global tag-management view and the
 * search palette's tag autocomplete.
 */
export interface IGetAllDistinctTags {
  execute(): TagAggregation[]
}
