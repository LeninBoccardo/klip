import type { Creator } from '@domain/entities'
import type { ICreatorRepository, IVideoRepository, ICutRepository } from '@domain/repositories'
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
 *
 * Hard-deleting a creator triggers SQL FK CASCADE on `videos` and `cuts` —
 * those rows disappear silently from the audit trail unless we enumerate them
 * before the delete. The audited delete reads child ids via the injected
 * video/cut repos and emits one `cascade_deleted` entry per victim inside the
 * same transaction.
 */
export class AuditedCreatorRepository implements ICreatorRepository {
  constructor(
    private inner: ICreatorRepository,
    private auditLog: IAuditLogRepository,
    private transaction: ITransactionScope,
    private videoRepo: IVideoRepository,
    private cutRepo: ICutRepository
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

  searchByName(query: string, limit: number): Creator[] {
    return this.inner.searchByName(query, limit)
  }

  upsert(creator: Creator): void {
    // Caller didn't supply prior state; read it for the audit diff.
    this.upsertWithPrevious(creator, this.inner.findById(creator.id))
  }

  upsertWithPrevious(creator: Creator, previous: Creator | null): void {
    this.transaction.run(() => {
      this.inner.upsert(creator)

      const now = new Date().toISOString()
      if (!previous) {
        this.auditLog.append({
          entityType: 'creator',
          entityId: creator.id,
          action: 'created',
          changes: null,
          createdAt: now
        })
      } else {
        const changes = diffObjects(
          previous as unknown as Record<string, unknown>,
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
      // Enumerate cascade victims BEFORE the delete fires — once SQL CASCADE
      // wipes the rows, we can't reconstruct the list.
      const videoIds = this.videoRepo.findIdsByCreator(id)
      const cutIds = this.cutRepo.findIdsByCreator(id)

      this.inner.delete(id)

      const now = new Date().toISOString()
      this.auditLog.append({
        entityType: 'creator',
        entityId: id,
        action: 'deleted',
        changes: null,
        createdAt: now
      })

      // One entry per cascade victim so the audit log can answer "what was
      // attached to this creator when it was deleted?" without a forensic
      // recovery from disk.
      const cascadeContext = JSON.stringify({
        cascadedFrom: { entityType: 'creator', entityId: id }
      })
      for (const videoId of videoIds) {
        this.auditLog.append({
          entityType: 'video',
          entityId: videoId,
          action: 'cascade_deleted',
          changes: cascadeContext,
          createdAt: now
        })
      }
      for (const cutId of cutIds) {
        this.auditLog.append({
          entityType: 'cut',
          entityId: cutId,
          action: 'cascade_deleted',
          changes: cascadeContext,
          createdAt: now
        })
      }
    })
  }

  findPaginated(params: PaginationParams): PaginatedResult<Creator> {
    return this.inner.findPaginated(params)
  }
}
