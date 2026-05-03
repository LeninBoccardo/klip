import type { DeleteTagGloballyResult } from '@shared/types'

/**
 * Removes a tag from every active video and cut that carries it, inside a
 * single transaction. Entities that don't carry the tag are untouched.
 *
 * Per-entity audit log entries are written by the audited repository decorator
 * (one upsert per affected entity); a single `db-updated` push fires at the end.
 */
export interface IDeleteTagGlobally {
  execute(tag: string): DeleteTagGloballyResult
}
