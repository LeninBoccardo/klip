import { eq, and, desc } from 'drizzle-orm'
import type { AppDatabase } from '@main/framework-drivers/database'
import { auditLog } from '@main/framework-drivers/database/schema'
import type { AuditEntry, AuditAction } from '@domain/entities'
import type { IAuditLogRepository } from '@domain/repositories'

type AuditRow = typeof auditLog.$inferSelect

function mapRow(row: AuditRow): AuditEntry {
  return { ...row, action: row.action as AuditAction }
}

export class SqliteAuditLogRepository implements IAuditLogRepository {
  constructor(private db: AppDatabase) {}

  append(entry: Omit<AuditEntry, 'id'>): void {
    this.db
      .insert(auditLog)
      .values({
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        changes: entry.changes,
        createdAt: entry.createdAt
      })
      .run()
  }

  findByEntity(entityType: string, entityId: string): AuditEntry[] {
    return this.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, entityType), eq(auditLog.entityId, entityId)))
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .all()
      .map(mapRow)
  }

  findRecent(limit: number): AuditEntry[] {
    return this.db
      .select()
      .from(auditLog)
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(limit)
      .all()
      .map(mapRow)
  }
}
