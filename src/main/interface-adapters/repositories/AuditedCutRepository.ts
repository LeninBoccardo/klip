import type { Cut } from '@domain/entities'
import type { ICutRepository, CutQueryParams } from '@domain/repositories'
import type { IAuditLogRepository } from '@domain/repositories'
import type { PaginatedResult, EntityStatus, ProbeStatus } from '@domain/types'
import { diffObjects } from './diff-objects'

/**
 * Decorator that wraps an ICutRepository and writes audit log entries
 * for every mutation. Reads are delegated directly.
 */
export class AuditedCutRepository implements ICutRepository {
  constructor(
    private inner: ICutRepository,
    private auditLog: IAuditLogRepository
  ) {}

  findAll(): Cut[] {
    return this.inner.findAll()
  }

  findAllActive(): Cut[] {
    return this.inner.findAllActive()
  }

  findById(id: string): Cut | null {
    return this.inner.findById(id)
  }

  findByCreatorId(creatorId: string): Cut[] {
    return this.inner.findByCreatorId(creatorId)
  }

  findByVideoId(videoId: string): Cut[] {
    return this.inner.findByVideoId(videoId)
  }

  findByTags(tags: string[]): Cut[] {
    return this.inner.findByTags(tags)
  }

  findByProbeStatus(status: ProbeStatus): Cut[] {
    return this.inner.findByProbeStatus(status)
  }

  upsert(cut: Cut): void {
    const existing = this.inner.findById(cut.id)
    this.inner.upsert(cut)

    const now = new Date().toISOString()
    if (!existing) {
      this.auditLog.append({
        entityType: 'cut',
        entityId: cut.id,
        action: 'created',
        changes: null,
        createdAt: now
      })
    } else {
      const changes = diffObjects(
        existing as unknown as Record<string, unknown>,
        cut as unknown as Record<string, unknown>
      )
      if (changes) {
        this.auditLog.append({
          entityType: 'cut',
          entityId: cut.id,
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
      entityType: 'cut',
      entityId: id,
      action: 'status_changed',
      changes: JSON.stringify({
        status: { old: existing?.status ?? null, new: status },
        deletedAt: { old: existing?.deletedAt ?? null, new: deletedAt }
      }),
      createdAt: new Date().toISOString()
    })
  }

  updateProbeStatus(id: string, probeStatus: ProbeStatus): void {
    const existing = this.inner.findById(id)
    this.inner.updateProbeStatus(id, probeStatus)

    this.auditLog.append({
      entityType: 'cut',
      entityId: id,
      action: 'probe_status_changed',
      changes: JSON.stringify({
        probeStatus: { old: existing?.probeStatus ?? null, new: probeStatus }
      }),
      createdAt: new Date().toISOString()
    })
  }

  delete(id: string): void {
    this.inner.delete(id)

    this.auditLog.append({
      entityType: 'cut',
      entityId: id,
      action: 'deleted',
      changes: null,
      createdAt: new Date().toISOString()
    })
  }

  findPaginated(params: CutQueryParams): PaginatedResult<Cut> {
    return this.inner.findPaginated(params)
  }
}
