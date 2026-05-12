/**
 * Scope of a `db-updated` push. Lets the renderer invalidate only the query
 * trees actually affected by the mutation that fired the push, instead of
 * the whole world.
 *
 * - `'all'`        — full reconciliation; any cached query may be stale.
 * - `'creators'`   — only the creators tree.
 * - `'videos'`     — only the videos tree (and audit log, which is creator-agnostic).
 * - `'cuts'`       — only the cuts tree.
 * - `'collections'` — only the collections tree (collection-level edits +
 *                    add/remove/reorder of items).
 * - `'downloadHistory'` — the persistent finished-downloads ledger; fires
 *                    whenever DownloadVideo appends a success/error row.
 *
 * Multiple scopes are expressed as an array. `'all'` is treated as a superset
 * by the renderer — when present, every scoped tree is invalidated.
 */
export type DbUpdateScope =
  | 'all'
  | 'creators'
  | 'videos'
  | 'cuts'
  | 'collections'
  | 'downloadHistory'

/** Payload of a `db-updated` push. */
export interface DbUpdatedPayload {
  scope: DbUpdateScope[]
}
