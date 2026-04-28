import type { RenameTagGloballyResult } from '@shared/types'

/**
 * Rewrites a tag from `oldTag` to `newTag` across every active video and cut
 * that carries it, inside a single transaction. If `newTag` is already
 * present alongside `oldTag` on the same entity, the tag list is deduplicated.
 *
 * Per-entity audit log entries are written by the audited repository decorator
 * (one upsert per affected entity); a single `db-updated` push fires at the end.
 */
export interface IRenameTagGlobally {
  execute(oldTag: string, newTag: string): RenameTagGloballyResult
}
