import type { Video } from '@domain/entities'
import type { IVideoRepository, VideoQueryParams } from '@domain/repositories'
import type { IAuditLogRepository } from '@domain/repositories'
import type { PaginatedResult, EntityStatus } from '@domain/types'

/**
 * Decorator that wraps an IVideoRepository and writes audit log entries
 * for every mutation. Reads are delegated directly.
 */
export class AuditedVideoRepository implements IVideoRepository {
  constructor(
    private inner: IVideoRepository,
    private auditLog: IAuditLogRepository
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

  upsert(video: Video): void {
    const existing = this.inner.findById(video.id)
    this.inner.upsert(video)

    const now = new Date().toISOString()
    if (!existing) {
      this.auditLog.append({
        entityType: 'video',
        entityId: video.id,
        action: 'created',
        changes: null,
        createdAt: now
      })
    } else {
      const changes = diffObjects(
        existing as unknown as Record<string, unknown>,
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
  }

  updateStatus(id: string, status: EntityStatus, deletedAt: string | null): void {
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
  }

  delete(id: string): void {
    this.inner.delete(id)

    this.auditLog.append({
      entityType: 'video',
      entityId: id,
      action: 'deleted',
      changes: null,
      createdAt: new Date().toISOString()
    })
  }

  findPaginated(params: VideoQueryParams): PaginatedResult<Video> {
    return this.inner.findPaginated(params)
  }
}

// ── Helpers ──

function diffObjects(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>
): string | null {
  const changes: Record<string, { old: unknown; new: unknown }> = {}
  for (const key of Object.keys(newObj)) {
    if (key === 'updatedAt') continue
    if (JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])) {
      changes[key] = { old: oldObj[key], new: newObj[key] }
    }
  }
  return Object.keys(changes).length > 0 ? JSON.stringify(changes) : null
}
