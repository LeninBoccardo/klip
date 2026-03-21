import type { IAuditLogRepository } from '@domain/repositories'
import type { AuditEntry } from '@domain/entities'
import type { AuditEntryDto } from '@shared/dtos'
import { createTypedHandler } from './create-typed-handler'

/** Map domain entity → renderer DTO (id is always present after DB read) */
function toDto(entry: AuditEntry): AuditEntryDto {
  return {
    id: entry.id!,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    changes: entry.changes,
    createdAt: entry.createdAt
  }
}

/**
 * IPC controller for audit log read operations.
 *
 * Registers:
 *   - `get-audit-log-by-entity` → entries for a specific entity
 *   - `get-audit-log-recent`    → most recent entries (across all entities)
 */
export function registerAuditLogController(auditLogRepo: IAuditLogRepository): void {
  createTypedHandler('get-audit-log-by-entity', async (_event, entityType, entityId) => {
    const entries = auditLogRepo.findByEntity(entityType, entityId)
    return entries.map(toDto)
  })

  createTypedHandler('get-audit-log-recent', async (_event, limit) => {
    const entries = auditLogRepo.findRecent(limit)
    return entries.map(toDto)
  })
}
