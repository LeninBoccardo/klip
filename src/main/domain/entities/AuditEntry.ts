/** Action type recorded in the audit log */
export type AuditAction =
  | 'created'
  | 'updated'
  | 'status_changed'
  | 'probe_status_changed'
  | 'deleted'

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
