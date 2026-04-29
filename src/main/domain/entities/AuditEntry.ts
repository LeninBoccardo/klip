/** Action type recorded in the audit log */
export type AuditAction =
  | 'created'
  | 'updated'
  | 'status_changed'
  | 'probe_status_changed'
  | 'deleted'
  | 'bulk_path_update'
  // Collection-item actions: collection-level audit row whose `entityId` is
  // the collection id and whose `changes` JSON describes the affected item.
  | 'item_added'
  | 'item_removed'
  | 'reordered'

/**
 * Immutable record of a single entity mutation.
 * Written by audited repository decorators on every write operation.
 */
export interface AuditEntry {
  id?: number
  entityType: string
  entityId: string
  action: AuditAction
  /** JSON diff: `{ field: { old, new } }` — null for 'created' actions */
  changes: string | null
  createdAt: string
}
