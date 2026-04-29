import type { Collection, CollectionItem } from '@domain/entities'
import type { ICollectionRepository } from '@domain/repositories'
import type { IAuditLogRepository } from '@domain/repositories'
import type { ITransactionScope } from '@domain/ports'
import type { PaginationParams, PaginatedResult } from '@domain/types'
import { diffObjects } from './diff-objects'

/**
 * Decorator that wraps an ICollectionRepository and writes audit log entries
 * for every mutation. Reads are delegated directly.
 *
 * Each mutation runs inside an `ITransactionScope.run(...)` so the inner
 * write and the audit append are committed atomically. Item-level mutations
 * (`addVideo`, `addCut`, `removeVideo`, `removeCut`, `reorderItems`) audit
 * against the parent collection's id with an action describing what changed.
 */
export class AuditedCollectionRepository implements ICollectionRepository {
  constructor(
    private inner: ICollectionRepository,
    private auditLog: IAuditLogRepository,
    private transaction: ITransactionScope
  ) {}

  findAll(): Collection[] {
    return this.inner.findAll()
  }

  findById(id: string): Collection | null {
    return this.inner.findById(id)
  }

  findPaginated(params: PaginationParams): PaginatedResult<Collection> {
    return this.inner.findPaginated(params)
  }

  upsert(collection: Collection): void {
    this.upsertWithPrevious(collection, this.inner.findById(collection.id))
  }

  upsertWithPrevious(collection: Collection, previous: Collection | null): void {
    this.transaction.run(() => {
      this.inner.upsert(collection)

      const now = new Date().toISOString()
      if (!previous) {
        this.auditLog.append({
          entityType: 'collection',
          entityId: collection.id,
          action: 'created',
          changes: null,
          createdAt: now
        })
      } else {
        const changes = diffObjects(
          previous as unknown as Record<string, unknown>,
          collection as unknown as Record<string, unknown>
        )
        if (changes) {
          this.auditLog.append({
            entityType: 'collection',
            entityId: collection.id,
            action: 'updated',
            changes,
            createdAt: now
          })
        }
      }
    })
  }

  delete(id: string): void {
    this.transaction.run(() => {
      this.inner.delete(id)

      this.auditLog.append({
        entityType: 'collection',
        entityId: id,
        action: 'deleted',
        changes: null,
        createdAt: new Date().toISOString()
      })
    })
  }

  getItems(collectionId: string): CollectionItem[] {
    return this.inner.getItems(collectionId)
  }

  addVideo(collectionId: string, videoId: string, position: number, addedAt: string): void {
    this.transaction.run(() => {
      this.inner.addVideo(collectionId, videoId, position, addedAt)
      this.auditLog.append({
        entityType: 'collection',
        entityId: collectionId,
        action: 'item_added',
        changes: JSON.stringify({ kind: 'video', id: videoId, position }),
        createdAt: new Date().toISOString()
      })
    })
  }

  addCut(collectionId: string, cutId: string, position: number, addedAt: string): void {
    this.transaction.run(() => {
      this.inner.addCut(collectionId, cutId, position, addedAt)
      this.auditLog.append({
        entityType: 'collection',
        entityId: collectionId,
        action: 'item_added',
        changes: JSON.stringify({ kind: 'cut', id: cutId, position }),
        createdAt: new Date().toISOString()
      })
    })
  }

  removeVideo(collectionId: string, videoId: string): void {
    this.transaction.run(() => {
      this.inner.removeVideo(collectionId, videoId)
      this.auditLog.append({
        entityType: 'collection',
        entityId: collectionId,
        action: 'item_removed',
        changes: JSON.stringify({ kind: 'video', id: videoId }),
        createdAt: new Date().toISOString()
      })
    })
  }

  removeCut(collectionId: string, cutId: string): void {
    this.transaction.run(() => {
      this.inner.removeCut(collectionId, cutId)
      this.auditLog.append({
        entityType: 'collection',
        entityId: collectionId,
        action: 'item_removed',
        changes: JSON.stringify({ kind: 'cut', id: cutId }),
        createdAt: new Date().toISOString()
      })
    })
  }

  reorderItems(collectionId: string, items: ReadonlyArray<CollectionItem>): void {
    this.transaction.run(() => {
      this.inner.reorderItems(collectionId, items)
      this.auditLog.append({
        entityType: 'collection',
        entityId: collectionId,
        action: 'reordered',
        changes: JSON.stringify({
          itemCount: items.length,
          order: items.map((i) => `${i.kind}:${i.id}`)
        }),
        createdAt: new Date().toISOString()
      })
    })
  }
}
