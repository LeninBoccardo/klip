import { eq, and, asc, desc, sql, gt, inArray, type SQL } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { AppDatabase } from '@main/framework-drivers/database'
import {
  collections,
  collectionVideos,
  collectionCuts
} from '@main/framework-drivers/database/schema'
import type { Collection, CollectionItem, CollectionKind } from '@domain/entities'
import type { ICollectionRepository } from '@domain/repositories'
import type { PaginationParams, PaginatedResult } from '@domain/types'
import { paginatedResult } from '@domain/types'
import { escapeLike } from './escape-like'

const SORT_COLUMNS: Record<string, SQLiteColumn> = {
  name: collections.name,
  createdAt: collections.createdAt,
  updatedAt: collections.updatedAt
}
const DEFAULT_SORT_COLUMN = collections.updatedAt

type CollectionRow = typeof collections.$inferSelect

function mapRow(row: CollectionRow): Collection {
  return { ...row, kind: row.kind as CollectionKind }
}

export class SqliteCollectionRepository implements ICollectionRepository {
  constructor(private db: AppDatabase) {}

  findAll(): Collection[] {
    return this.db.select().from(collections).orderBy(desc(collections.updatedAt)).all().map(mapRow)
  }

  findById(id: string): Collection | null {
    const row = this.db.select().from(collections).where(eq(collections.id, id)).get()
    return row ? mapRow(row) : null
  }

  findPaginated(params: PaginationParams): PaginatedResult<Collection> {
    const conditions: SQL[] = []

    if (params.search) {
      conditions.push(
        sql`${collections.name} LIKE ${'%' + escapeLike(params.search) + '%'} ESCAPE '\\'`
      )
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined
    const sortColumn = SORT_COLUMNS[params.sortBy ?? ''] ?? DEFAULT_SORT_COLUMN
    const direction = params.sortDirection === 'asc' ? asc(sortColumn) : desc(sortColumn)
    const offset = (params.page - 1) * params.pageSize

    const [{ count }] = this.db
      .select({ count: sql<number>`count(*)` })
      .from(collections)
      .where(where)
      .all()

    // Secondary `id DESC` tiebreaker so rows that share the primary sort key
    // get a stable order across page boundaries.
    const rows = this.db
      .select()
      .from(collections)
      .where(where)
      .orderBy(direction, desc(collections.id))
      .limit(params.pageSize)
      .offset(offset)
      .all()

    return paginatedResult(rows.map(mapRow), count, params)
  }

  upsert(collection: Collection): void {
    this.db
      .insert(collections)
      .values({
        id: collection.id,
        name: collection.name,
        description: collection.description,
        kind: collection.kind,
        smartQuery: collection.smartQuery,
        createdAt: collection.createdAt,
        updatedAt: collection.updatedAt
      })
      .onConflictDoUpdate({
        target: collections.id,
        set: {
          name: sql`excluded.name`,
          description: sql`excluded.description`,
          kind: sql`excluded.kind`,
          smartQuery: sql`excluded.smart_query`,
          updatedAt: sql`excluded.updated_at`
        }
      })
      .run()
  }

  /** Inner repos don't track audit history, so the prior state is irrelevant. */
  upsertWithPrevious(collection: Collection, _previous: Collection | null): void {
    this.upsert(collection)
  }

  delete(id: string): void {
    // FK CASCADE wipes the join rows; no manual cleanup needed.
    this.db.delete(collections).where(eq(collections.id, id)).run()
  }

  getItems(collectionId: string): CollectionItem[] {
    // UNION ALL preserves both kinds; the outer ORDER BY uses position so
    // the renderer can render straight from the array. We bind the literal
    // 'video' / 'cut' kind discriminator inline rather than computing it on
    // the renderer side.
    const rows = this.db.all(
      sql`
        SELECT 'video' AS kind, video_id AS id, position, added_at AS addedAt
        FROM collection_videos
        WHERE collection_id = ${collectionId}
        UNION ALL
        SELECT 'cut' AS kind, cut_id AS id, position, added_at AS addedAt
        FROM collection_cuts
        WHERE collection_id = ${collectionId}
        ORDER BY position ASC
      `
    ) as Array<{ kind: 'video' | 'cut'; id: string; position: number; addedAt: string }>

    return rows
  }

  countItemsByCollection(ids: string[]): Map<string, number> {
    const counts = new Map<string, number>()
    if (ids.length === 0) return counts
    // Two grouped COUNTs for the whole page (not a getItems() per collection):
    // each join table contributes its membership count; sum per collection id.
    const videoCounts = this.db
      .select({ cid: collectionVideos.collectionId, n: sql<number>`count(*)` })
      .from(collectionVideos)
      .where(inArray(collectionVideos.collectionId, ids))
      .groupBy(collectionVideos.collectionId)
      .all()
    const cutCounts = this.db
      .select({ cid: collectionCuts.collectionId, n: sql<number>`count(*)` })
      .from(collectionCuts)
      .where(inArray(collectionCuts.collectionId, ids))
      .groupBy(collectionCuts.collectionId)
      .all()
    for (const { cid, n } of [...videoCounts, ...cutCounts]) {
      counts.set(cid, (counts.get(cid) ?? 0) + Number(n))
    }
    return counts
  }

  addVideo(collectionId: string, videoId: string, position: number, addedAt: string): void {
    this.db.insert(collectionVideos).values({ collectionId, videoId, position, addedAt }).run()
  }

  addCut(collectionId: string, cutId: string, position: number, addedAt: string): void {
    this.db.insert(collectionCuts).values({ collectionId, cutId, position, addedAt }).run()
  }

  removeVideo(collectionId: string, videoId: string): void {
    this.db
      .delete(collectionVideos)
      .where(
        and(eq(collectionVideos.collectionId, collectionId), eq(collectionVideos.videoId, videoId))
      )
      .run()
  }

  removeCut(collectionId: string, cutId: string): void {
    this.db
      .delete(collectionCuts)
      .where(and(eq(collectionCuts.collectionId, collectionId), eq(collectionCuts.cutId, cutId)))
      .run()
  }

  reorderItems(collectionId: string, items: ReadonlyArray<CollectionItem>): void {
    // Two-phase update so we never violate the application-level "position is
    // unique within a collection across both tables" invariant mid-write.
    // Phase 1: bump every existing position into a high range that can't
    // collide with the target positions. Phase 2: write the desired final
    // positions. Cheap at the documented <500 items/collection scale.
    const SHIFT = 1_000_000

    this.db
      .update(collectionVideos)
      .set({ position: sql`${collectionVideos.position} + ${SHIFT}` })
      .where(
        and(eq(collectionVideos.collectionId, collectionId), gt(collectionVideos.position, -1))
      )
      .run()

    this.db
      .update(collectionCuts)
      .set({ position: sql`${collectionCuts.position} + ${SHIFT}` })
      .where(and(eq(collectionCuts.collectionId, collectionId), gt(collectionCuts.position, -1)))
      .run()

    // Phase 2: per-row update with the new position. Items not present in the
    // input list keep their shifted position, which is fine — they'll sort
    // after everything in the desired order. The use case enforces
    // membership completeness before calling, so in practice this only
    // happens during a partial reorder (which we don't expose).
    for (const item of items) {
      if (item.kind === 'video') {
        this.db
          .update(collectionVideos)
          .set({ position: item.position })
          .where(
            and(
              eq(collectionVideos.collectionId, collectionId),
              eq(collectionVideos.videoId, item.id)
            )
          )
          .run()
      } else {
        this.db
          .update(collectionCuts)
          .set({ position: item.position })
          .where(
            and(eq(collectionCuts.collectionId, collectionId), eq(collectionCuts.cutId, item.id))
          )
          .run()
      }
    }
  }
}
