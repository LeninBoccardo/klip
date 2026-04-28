import type { BulkUpdateTagsRequest, BulkUpdateTagsResult } from '@shared/types'

/**
 * Applies an additive/subtractive set-operation to the `tags` JSON column of
 * many videos or cuts inside a single transaction. Per-entity audit log
 * entries are written by the audited repository decorator (one per upsert);
 * a single `db-updated` push is emitted at the end so the renderer triggers
 * exactly one round of query invalidation regardless of batch size.
 */
export interface IBulkUpdateTags {
  execute(request: BulkUpdateTagsRequest): BulkUpdateTagsResult
}
