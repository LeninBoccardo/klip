import type { AuditEntry } from '@domain/entities'

export interface IAuditLogRepository {
  /** Append an immutable audit entry */
  append(entry: Omit<AuditEntry, 'id'>): void

  /** Find all audit entries for a specific entity */
  findByEntity(entityType: string, entityId: string): AuditEntry[]

  /** Find the most recent audit entries across all entities */
  findRecent(limit: number): AuditEntry[]
}
