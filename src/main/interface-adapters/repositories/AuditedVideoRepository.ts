import type { Video } from '@domain/entities'
import type { IVideoRepository, VideoQueryParams } from '@domain/repositories'
import type { IAuditLogRepository } from '@domain/repositories'
import type { ITransactionScope } from '@domain/ports'
import type { PaginatedResult, EntityStatus, ProbeStatus } from '@domain/types'
import { diffObjects } from './diff-objects'

/**
 * Decorator that wraps an IVideoRepository and writes audit log entries
 * for every mutation. Reads are delegated directly.
 *
 * Each mutation runs inside an `ITransactionScope.run(...)` so the inner write
 * and the audit append are committed atomically.
 */
export class AuditedVideoRepository implements IVideoRepository {
  constructor(
    private inner: IVideoRepository,
    private auditLog: IAuditLogRepository,
    private transaction: ITransactionScope
  ) {}

  findAll(): Video[] {
    return this.inner.findAll()
  }

  findAllActive(): Video[] {
    return this.inner.findAllActive()
  }

  findById(id: string): Video | null {
    return this.inner.findById(id)
  }

  findByCreatorId(creatorId: string): Video[] {
    return this.inner.findByCreatorId(creatorId)
  }

  findByProbeStatus(status: ProbeStatus): Video[] {
    return this.inner.findByProbeStatus(status)
  }

  findNeedingDetail(): Video[] {
    return this.inner.findNeedingDetail()
  }

  findByTags(tags: string[]): Video[] {
    return this.inner.findByTags(tags)
  }

  searchByTitle(query: string, limit: number): Video[] {
    return this.inner.searchByTitle(query, limit)
  }

  getAllDistinctTags(): { tag: string; count: number }[] {
    return this.inner.getAllDistinctTags()
  }

  upsert(video: Video): void {
    // Caller didn't supply prior state; read it for the audit diff.
    this.upsertWithPrevious(video, this.inner.findById(video.id))
  }

  upsertWithPrevious(video: Video, previous: Video | null): void {
    this.transaction.run(() => {
      this.inner.upsert(video)

      const now = new Date().toISOString()
      if (!previous) {
        this.auditLog.append({
          entityType: 'video',
          entityId: video.id,
          action: 'created',
          changes: null,
          createdAt: now
        })
      } else {
        const changes = diffObjects(
          previous as unknown as Record<string, unknown>,
          video as unknown as Record<string, unknown>
        )
        if (changes) {
          this.auditLog.append({
            entityType: 'video',
            entityId: video.id,
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
        entityType: 'video',
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

  updateProbeStatus(id: string, probeStatus: ProbeStatus): void {
    this.transaction.run(() => {
      const existing = this.inner.findById(id)
      this.inner.updateProbeStatus(id, probeStatus)

      this.auditLog.append({
        entityType: 'video',
        entityId: id,
        action: 'probe_status_changed',
        changes: JSON.stringify({
          probeStatus: { old: existing?.probeStatus ?? null, new: probeStatus }
        }),
        createdAt: new Date().toISOString()
      })
    })
  }

  delete(id: string): void {
    this.transaction.run(() => {
      this.inner.delete(id)

      this.auditLog.append({
        entityType: 'video',
        entityId: id,
        action: 'deleted',
        changes: null,
        createdAt: new Date().toISOString()
      })
    })
  }

  findPaginated(params: VideoQueryParams): PaginatedResult<Video> {
    return this.inner.findPaginated(params)
  }

  updateFilePathPrefix(oldPrefix: string, newPrefix: string): void {
    this.transaction.run(() => {
      this.inner.updateFilePathPrefix(oldPrefix, newPrefix)

      this.auditLog.append({
        entityType: 'video',
        entityId: '*',
        action: 'bulk_path_update',
        changes: JSON.stringify({ oldPrefix, newPrefix }),
        createdAt: new Date().toISOString()
      })
    })
  }
}
