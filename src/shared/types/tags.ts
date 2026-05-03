/** Which entity table a tag operation targets. */
export type TagEntityKind = 'video' | 'cut'

/**
 * Aggregated count of how many active videos and cuts carry a given tag.
 * Driven by `GetAllDistinctTags` — the union/grouping over both entity tables.
 */
export interface TagAggregation {
  tag: string
  videoCount: number
  cutCount: number
}

/**
 * Input contract for `BulkUpdateTags`.
 *
 * Both `addTags` and `removeTags` are optional but at least one must be
 * non-empty (the use case rejects no-ops up front). Tag operations are
 * applied per-entity as set operations: the resulting tag list is
 * `(currentTags ∪ addTags) \ removeTags`, then deduplicated.
 */
export interface BulkUpdateTagsRequest {
  entityKind: TagEntityKind
  ids: string[]
  addTags?: string[]
  removeTags?: string[]
}

export interface BulkUpdateTagsResult {
  updated: number
  skipped: number
}

export interface RenameTagGloballyResult {
  videosUpdated: number
  cutsUpdated: number
}

export interface DeleteTagGloballyResult {
  videosUpdated: number
  cutsUpdated: number
}
