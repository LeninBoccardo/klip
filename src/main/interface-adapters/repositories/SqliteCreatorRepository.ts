import { eq, and, like, inArray, asc, desc, sql } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { AppDatabase } from '@main/framework-drivers/database'
import { creators } from '@main/framework-drivers/database/schema'
import type { Creator } from '@domain/entities'
import type { ICreatorRepository } from '@domain/repositories'
import type { PaginationParams, PaginatedResult, EntityStatus } from '@domain/types'
import { paginatedResult } from '@domain/types'

// ── sort-column allowlist (camelCase UI key → Drizzle column reference) ──

const SORT_COLUMNS: Record<string, SQLiteColumn> = {
  name: creators.name,
  status: creators.status,
  createdAt: creators.createdAt,
  updatedAt: creators.updatedAt
}
const DEFAULT_SORT_COLUMN = creators.name

type CreatorRow = typeof creators.$inferSelect

function mapRow(row: CreatorRow): Creator {
  return { ...row, status: row.status as EntityStatus }
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

  upsert(creator: Creator): void {
    this.db
      .insert(creators)
      .values({
        id: creator.id,
        folderName: creator.folderName,
        name: creator.name,
        profileImagePath: creator.profileImagePath,
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
          status: sql`excluded.status`,
          deletedAt: sql`excluded.deleted_at`,
          updatedAt: sql`excluded.updated_at`
        }
      })
      .run()
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
      conditions.push(like(creators.name, `%${params.search}%`))
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

    const rows = this.db
      .select()
      .from(creators)
      .where(where)
      .orderBy(direction)
      .limit(params.pageSize)
      .offset(offset)
      .all()

    return paginatedResult(rows.map(mapRow), count, params)
  }
}
