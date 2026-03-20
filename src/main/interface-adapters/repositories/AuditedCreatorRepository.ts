import type { Creator } from '@domain/entities'
import type { ICreatorRepository } from '@domain/repositories'
import type { IAuditLogRepository } from '@domain/repositories'
import type { PaginationParams, PaginatedResult, EntityStatus } from '@domain/types'

/**
 * Decorator that wraps an ICreatorRepository and writes audit log entries
 * for every mutation. Reads are delegated directly.
 */
export class AuditedCreatorRepository implements ICreatorRepository {
  constructor(
    private inner: ICreatorRepository,
    private auditLog: IAuditLogRepository
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

  upsert(creator: Creator): void {
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
  }

  updateStatus(id: string, status: EntityStatus, deletedAt: string | null): void {
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
  }

  delete(id: string): void {
    this.inner.delete(id)

    this.auditLog.append({
      entityType: 'creator',
      entityId: id,
      action: 'deleted',
      changes: null,
      createdAt: new Date().toISOString()
    })
  }

  findPaginated(params: PaginationParams): PaginatedResult<Creator> {
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
    if (key === 'updatedAt') continue // always changes, not interesting
    if (JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])) {
      changes[key] = { old: oldObj[key], new: newObj[key] }
    }
  }
  return Object.keys(changes).length > 0 ? JSON.stringify(changes) : null
}
