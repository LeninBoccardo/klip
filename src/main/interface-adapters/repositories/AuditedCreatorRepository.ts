import type { Creator } from '@domain/entities'
import type { ICreatorRepository } from '@domain/repositories'
import type { IAuditLogRepository } from '@domain/repositories'
import type { ITransactionScope } from '@domain/ports'
import type { PaginationParams, PaginatedResult, EntityStatus } from '@domain/types'
import { diffObjects } from './diff-objects'

/**
 * Decorator that wraps an ICreatorRepository and writes audit log entries
 * for every mutation. Reads are delegated directly.
 *
 * Each mutation method runs the inner write + the audit append inside a single
 * `ITransactionScope.run(...)`, guaranteeing they commit or roll back together.
 * Nested transactions (e.g. when called from a use case that already opened
 * one) are handled via SQLite SAVEPOINTs by better-sqlite3.
 */
export class AuditedCreatorRepository implements ICreatorRepository {
  constructor(
    private inner: ICreatorRepository,
    private auditLog: IAuditLogRepository,
    private transaction: ITransactionScope
  ) {}

  findAll(): Creator[] {
    return this.inner.findAll()
  }

  findAllActive(): Creator[] {
    return this.inner.findAllActive()
  }

  findById(id: string): Creator | null {
    return this.inner.findById(id)
  }

  findByFolderName(folderName: string): Creator | null {
    return this.inner.findByFolderName(folderName)
  }

  findByYoutubeChannelId(channelId: string): Creator | null {
    return this.inner.findByYoutubeChannelId(channelId)
  }

  upsert(creator: Creator): void {
    this.transaction.run(() => {
      const existing = this.inner.findById(creator.id)
      this.inner.upsert(creator)

      const now = new Date().toISOString()
      if (!existing) {
        this.auditLog.append({
          entityType: 'creator',
          entityId: creator.id,
          action: 'created',
          changes: null,
          createdAt: now
        })
      } else {
        const changes = diffObjects(
          existing as unknown as Record<string, unknown>,
          creator as unknown as Record<string, unknown>
        )
        if (changes) {
          this.auditLog.append({
            entityType: 'creator',
            entityId: creator.id,
            action: 'updated',
            changes,
            createdAt: now
          })
        }
      }
    })
  }

  updateStatus(id: string, status: EntityStatus, deletedAt: string | null): void {
    this.transaction.run(() => {
      const existing = this.inner.findById(id)
      this.inner.updateStatus(id, status, deletedAt)

      this.auditLog.append({
        entityType: 'creator',
        entityId: id,
        action: 'status_changed',
        changes: JSON.stringify({
          status: { old: existing?.status ?? null, new: status },
          deletedAt: { old: existing?.deletedAt ?? null, new: deletedAt }
        }),
        createdAt: new Date().toISOString()
      })
    })
  }

  delete(id: string): void {
    this.transaction.run(() => {
      this.inner.delete(id)

      this.auditLog.append({
        entityType: 'creator',
        entityId: id,
        action: 'deleted',
        changes: null,
        createdAt: new Date().toISOString()
      })
    })
  }

  findPaginated(params: PaginationParams): PaginatedResult<Creator> {
    return this.inner.findPaginated(params)
  }
}
