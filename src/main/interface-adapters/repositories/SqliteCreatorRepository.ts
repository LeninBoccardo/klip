import { eq, and, inArray, asc, desc, sql } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { AppDatabase } from '@main/framework-drivers/database'
import { creators } from '@main/framework-drivers/database/schema'
import type { Creator } from '@domain/entities'
import type { ICreatorRepository } from '@domain/repositories'
import type { PaginationParams, PaginatedResult, EntityStatus } from '@domain/types'
import { paginatedResult } from '@domain/types'
import { escapeLike } from './escape-like'

// ── sort-column allowlist (camelCase UI key → Drizzle column reference) ──

const SORT_COLUMNS: Record<string, SQLiteColumn> = {
  name: creators.name,
  status: creators.status,
  subscriberCount: creators.subscriberCount,
  createdAt: creators.createdAt,
  updatedAt: creators.updatedAt
}
const DEFAULT_SORT_COLUMN = creators.name

type CreatorRow = typeof creators.$inferSelect

function mapRow(row: CreatorRow): Creator {
  return {
    ...row,
    status: row.status as EntityStatus,
    tags: parseTags(row.tags)
  }
}

function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.every((t) => typeof t === 'string')) return parsed
  } catch {
    // fall through
  }
  console.warn('[SqliteCreatorRepository] Invalid tags JSON, defaulting to []:', raw)
  return []
}

export class SqliteCreatorRepository implements ICreatorRepository {
  constructor(private db: AppDatabase) {}

  findAll(): Creator[] {
    return this.db.select().from(creators).orderBy(asc(creators.name)).all().map(mapRow)
  }

  findAllActive(): Creator[] {
    return this.db
      .select()
      .from(creators)
      .where(eq(creators.status, 'active'))
      .orderBy(asc(creators.name))
      .all()
      .map(mapRow)
  }

  findById(id: string): Creator | null {
    const row = this.db.select().from(creators).where(eq(creators.id, id)).get()
    return row ? mapRow(row) : null
  }

  findByFolderName(folderName: string): Creator | null {
    const row = this.db.select().from(creators).where(eq(creators.folderName, folderName)).get()
    return row ? mapRow(row) : null
  }

  findByYoutubeChannelId(channelId: string): Creator | null {
    const row = this.db
      .select()
      .from(creators)
      .where(eq(creators.youtubeChannelId, channelId))
      .get()
    return row ? mapRow(row) : null
  }

  searchByName(query: string, limit: number): Creator[] {
    const trimmed = query.trim()
    if (trimmed.length === 0 || limit <= 0) return []

    const pattern = `%${escapeLike(trimmed)}%`
    return this.db
      .select()
      .from(creators)
      .where(and(eq(creators.status, 'active'), sql`${creators.name} LIKE ${pattern} ESCAPE '\\'`))
      .orderBy(asc(creators.name))
      .limit(limit)
      .all()
      .map(mapRow)
  }

  upsert(creator: Creator): void {
    this.db
      .insert(creators)
      .values({
        id: creator.id,
        folderName: creator.folderName,
        name: creator.name,
        profileImagePath: creator.profileImagePath,
        youtubeChannelId: creator.youtubeChannelId,
        youtubeChannelUrl: creator.youtubeChannelUrl,
        subscriberCount: creator.subscriberCount,
        avatarUrl: creator.avatarUrl,
        notes: creator.notes,
        tags: JSON.stringify(creator.tags),
        status: creator.status,
        deletedAt: creator.deletedAt,
        createdAt: creator.createdAt,
        updatedAt: creator.updatedAt
      })
      .onConflictDoUpdate({
        target: creators.id,
        set: {
          folderName: sql`excluded.folder_name`,
          name: sql`excluded.name`,
          profileImagePath: sql`excluded.profile_image_path`,
          youtubeChannelId: sql`excluded.youtube_channel_id`,
          youtubeChannelUrl: sql`excluded.youtube_channel_url`,
          subscriberCount: sql`excluded.subscriber_count`,
          avatarUrl: sql`excluded.avatar_url`,
          notes: sql`excluded.notes`,
          tags: sql`excluded.tags`,
          status: sql`excluded.status`,
          deletedAt: sql`excluded.deleted_at`,
          updatedAt: sql`excluded.updated_at`
        }
      })
      .run()
  }

  /** Inner repos don't track audit history, so the prior state is irrelevant. */
  upsertWithPrevious(creator: Creator, _previous: Creator | null): void {
    this.upsert(creator)
  }

  updateStatus(id: string, status: EntityStatus, deletedAt: string | null): void {
    this.db
      .update(creators)
      .set({ status, deletedAt, updatedAt: new Date().toISOString() })
      .where(eq(creators.id, id))
      .run()
  }

  delete(id: string): void {
    this.db.delete(creators).where(eq(creators.id, id)).run()
  }

  findPaginated(params: PaginationParams): PaginatedResult<Creator> {
    const statuses = params.status && params.status.length > 0 ? params.status : ['active']
    const conditions = [inArray(creators.status, statuses)]

    if (params.search) {
      conditions.push(
        sql`${creators.name} LIKE ${'%' + escapeLike(params.search) + '%'} ESCAPE '\\'`
      )
    }

    const where = and(...conditions)
    const sortColumn = SORT_COLUMNS[params.sortBy ?? ''] ?? DEFAULT_SORT_COLUMN
    const direction = params.sortDirection === 'desc' ? desc(sortColumn) : asc(sortColumn)
    const offset = (params.page - 1) * params.pageSize

    const [{ count }] = this.db
      .select({ count: sql<number>`count(*)` })
      .from(creators)
      .where(where)
      .all()

    // Secondary `id DESC` tiebreaker so rows that share the primary sort key
    // (e.g. identical `createdAt` timestamps when seeded from a script, or
    // many rows with the same status) get a stable order across page
    // boundaries. Without it, SQLite is free to reorder ties.
    const rows = this.db
      .select()
      .from(creators)
      .where(where)
      .orderBy(direction, desc(creators.id))
      .limit(params.pageSize)
      .offset(offset)
      .all()

    return paginatedResult(rows.map(mapRow), count, params)
  }
}
