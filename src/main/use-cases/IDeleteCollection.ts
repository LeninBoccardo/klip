/**
 * Hard-deletes a collection. FK CASCADE wipes the join rows in
 * `collection_videos` and `collection_cuts`; the underlying videos and
 * cuts are not touched. Idempotent — deleting a non-existent id is a
 * no-op without an audit entry.
 */
export interface IDeleteCollection {
  execute(id: string): { deleted: boolean }
}
