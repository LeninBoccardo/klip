import type { AuditEntryDto } from '@shared/dtos'

export type AuditEntityKind = 'creator' | 'video' | 'cut' | 'collection' | 'unknown'

const KNOWN_ENTITIES: ReadonlySet<string> = new Set(['creator', 'video', 'cut', 'collection'])

export function classifyEntity(entityType: string): AuditEntityKind {
  return KNOWN_ENTITIES.has(entityType) ? (entityType as AuditEntityKind) : 'unknown'
}

const KNOWN_ACTIONS: ReadonlySet<string> = new Set([
  'created',
  'updated',
  'deleted',
  'cascade_deleted',
  'status_changed',
  'probe_status_changed',
  'bulk_path_update',
  'item_added',
  'item_removed',
  'reordered'
])

export type AuditActionKey =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'cascade_deleted'
  | 'status_changed'
  | 'probe_status_changed'
  | 'bulk_path_update'
  | 'item_added'
  | 'item_removed'
  | 'reordered'
  | 'unknown'

export function classifyAction(action: string): AuditActionKey {
  return KNOWN_ACTIONS.has(action) ? (action as AuditActionKey) : 'unknown'
}

/**
 * Returns a navigation target for the entity referenced by an audit entry, or
 * null if the entity is not directly addressable (e.g. cascade-deleted items).
 *
 * Caller is expected to filter on entity status separately — a deleted entity
 * still has a route, and the detail page can decide how to render the deleted
 * state.
 */
export function entityHref(entry: AuditEntryDto): string | null {
  switch (classifyEntity(entry.entityType)) {
    case 'creator':
      return `/creators/${entry.entityId}`
    case 'video':
      return `/videos/${entry.entityId}`
    case 'cut':
      // Cuts don't have their own detail route yet; surface them via the
      // dedicated /cuts page.
      return '/cuts'
    case 'collection':
      return `/collections/${entry.entityId}`
    default:
      return null
  }
}
