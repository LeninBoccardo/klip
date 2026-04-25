import { eq, and, inArray, asc, desc, sql } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { AppDatabase } from '@main/framework-drivers/database'
import { cuts } from '@main/framework-drivers/database/schema'
import type { Cut } from '@domain/entities'
import type { ICutRepository, CutQueryParams } from '@domain/repositories'
import type { PaginatedResult, EntityStatus, ProbeStatus } from '@domain/types'
import { paginatedResult } from '@domain/types'
import { escapeLike } from './escape-like'

// ── sort-column allowlist (camelCase UI key → Drizzle column reference) ──

const SORT_COLUMNS: Record<string, SQLiteColumn> = {
  title: cuts.title,
  duration: cuts.duration,
  fileSize: cuts.fileSize,
  startTimestamp: cuts.startTimestamp,
  endTimestamp: cuts.endTimestamp,
  status: cuts.status,
  createdAt: cuts.createdAt,
  updatedAt: cuts.updatedAt
}
const DEFAULT_SORT_COLUMN = cuts.createdAt

// ── Helpers for tags JSON serialization ──

function parseTags(tagsStr: string | null): string[] {
  if (!tagsStr) return []
  try {
    const parsed = JSON.parse(tagsStr)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Map a raw Drizzle row (tags as JSON string) to a Cut entity (tags as string[]) */
function mapRowToCut(row: {
  id: string
  creatorId: string
  videoId: string | null
  title: string
  tags: string | null
  startTimestamp: number | null
  endTimestamp: number | null
  duration: number | null
  resolution: string | null
  fileSize: number | null
  filePath: string
  thumbnailPath: string | null
  probeStatus: string
  status: string
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}): Cut {
  return {
    ...row,
    tags: parseTags(row.tags),
    probeStatus: row.probeStatus as ProbeStatus,
    status: row.status as EntityStatus
  }
}

export class SqliteCutRepository implements ICutRepository {
  constructor(private db: AppDatabase) {}

  findAll(): Cut[] {
    return this.db.select().from(cuts).orderBy(desc(cuts.createdAt)).all().map(mapRowToCut)
  }

  findAllActive(): Cut[] {
    return this.db
      .select()
      .from(cuts)
      .where(eq(cuts.status, 'active'))
      .orderBy(desc(cuts.createdAt))
      .all()
      .map(mapRowToCut)
  }

  findById(id: string): Cut | null {
    const row = this.db.select().from(cuts).where(eq(cuts.id, id)).get()
    return row ? mapRowToCut(row) : null
  }

  findByCreatorId(creatorId: string): Cut[] {
    return this.db
      .select()
      .from(cuts)
      .where(eq(cuts.creatorId, creatorId))
      .orderBy(desc(cuts.createdAt))
      .all()
      .map(mapRowToCut)
  }

  findByVideoId(videoId: string): Cut[] {
    return this.db
      .select()
      .from(cuts)
      .where(and(eq(cuts.videoId, videoId), eq(cuts.status, 'active')))
      .orderBy(desc(cuts.createdAt))
      .all()
      .map(mapRowToCut)
  }

  findByProbeStatus(status: ProbeStatus): Cut[] {
    return this.db
      .select()
      .from(cuts)
      .where(eq(cuts.probeStatus, status))
      .orderBy(asc(cuts.createdAt))
      .all()
      .map(mapRowToCut)
  }

  findByTags(tags: string[]): Cut[] {
    if (tags.length === 0) return []

    const tagValues = sql.join(
      tags.map((t) => sql`${t}`),
      sql`, `
    )

    const rows = this.db.all(
      sql`SELECT DISTINCT c.id, c.creator_id AS creatorId, c.video_id AS videoId,
                c.title, c.tags, c.start_timestamp AS startTimestamp,
                c.end_timestamp AS endTimestamp, c.duration, c.resolution,
                c.file_size AS fileSize, c.file_path AS filePath,
                c.thumbnail_path AS thumbnailPath,
                c.probe_status AS probeStatus,
                c.status, c.deleted_at AS deletedAt,
                c.created_at AS createdAt, c.updated_at AS updatedAt
         FROM cuts c, json_each(c.tags) AS t
         WHERE c.status = 'active' AND t.value IN (${tagValues})
         ORDER BY c.created_at DESC`
    ) as Array<{
      id: string
      creatorId: string
      videoId: string | null
      title: string
      tags: string | null
      startTimestamp: number | null
      endTimestamp: number | null
      duration: number | null
      resolution: string | null
      fileSize: number | null
      filePath: string
      thumbnailPath: string | null
      probeStatus: string
      status: string
      deletedAt: string | null
      createdAt: string
      updatedAt: string
    }>

    return rows.map(mapRowToCut)
  }

  upsert(cut: Cut): void {
    this.db
      .insert(cuts)
      .values({
        id: cut.id,
        creatorId: cut.creatorId,
        videoId: cut.videoId,
        title: cut.title,
        tags: JSON.stringify(cut.tags),
        startTimestamp: cut.startTimestamp,
        endTimestamp: cut.endTimestamp,
        duration: cut.duration,
        resolution: cut.resolution,
        fileSize: cut.fileSize,
        filePath: cut.filePath,
        thumbnailPath: cut.thumbnailPath,
        probeStatus: cut.probeStatus,
        status: cut.status,
        deletedAt: cut.deletedAt,
        createdAt: cut.createdAt,
        updatedAt: cut.updatedAt
      })
      .onConflictDoUpdate({
        target: cuts.id,
        set: {
          creatorId: sql`excluded.creator_id`,
          videoId: sql`excluded.video_id`,
          title: sql`excluded.title`,
          tags: sql`excluded.tags`,
          startTimestamp: sql`excluded.start_timestamp`,
          endTimestamp: sql`excluded.end_timestamp`,
          duration: sql`excluded.duration`,
          resolution: sql`excluded.resolution`,
          fileSize: sql`excluded.file_size`,
          filePath: sql`excluded.file_path`,
          thumbnailPath: sql`excluded.thumbnail_path`,
          probeStatus: sql`excluded.probe_status`,
          status: sql`excluded.status`,
          deletedAt: sql`excluded.deleted_at`,
          updatedAt: sql`excluded.updated_at`
        }
      })
      .run()
  }

  updateStatus(id: string, status: EntityStatus, deletedAt: string | null): void {
    this.db
      .update(cuts)
      .set({ status, deletedAt, updatedAt: new Date().toISOString() })
      .where(eq(cuts.id, id))
      .run()
  }

  updateProbeStatus(id: string, probeStatus: ProbeStatus): void {
    this.db
      .update(cuts)
      .set({ probeStatus, updatedAt: new Date().toISOString() })
      .where(eq(cuts.id, id))
      .run()
  }

  delete(id: string): void {
    this.db.delete(cuts).where(eq(cuts.id, id)).run()
  }

  updateFilePathPrefix(oldPrefix: string, newPrefix: string): void {
    // Anchored prefix replacement via substr() — `replace()` is global and would
    // rewrite mid-path occurrences of oldPrefix as well.
    this.db
      .update(cuts)
      .set({
        filePath: sql`${newPrefix} || substr(${cuts.filePath}, length(${oldPrefix}) + 1)`,
        thumbnailPath: sql`CASE WHEN ${cuts.thumbnailPath} IS NOT NULL AND substr(${cuts.thumbnailPath}, 1, length(${oldPrefix})) = ${oldPrefix} THEN ${newPrefix} || substr(${cuts.thumbnailPath}, length(${oldPrefix}) + 1) ELSE ${cuts.thumbnailPath} END`,
        updatedAt: new Date().toISOString()
      })
      .where(sql`${cuts.filePath} LIKE ${oldPrefix + '%'}`)
      .run()
  }

  findPaginated(params: CutQueryParams): PaginatedResult<Cut> {
    const statuses = params.status && params.status.length > 0 ? params.status : ['active']
    const conditions = [inArray(cuts.status, statuses)]

    if (params.creatorId) {
      conditions.push(eq(cuts.creatorId, params.creatorId))
    }

    if (params.videoId) {
      conditions.push(eq(cuts.videoId, params.videoId))
    }

    if (params.search) {
      conditions.push(sql`${cuts.title} LIKE ${'%' + escapeLike(params.search) + '%'} ESCAPE '\\'`)
    }

    // Tags filter uses a raw SQL EXISTS subquery
    const tagFilter =
      params.tags && params.tags.length > 0
        ? sql`EXISTS (SELECT 1 FROM json_each(${cuts.tags}) WHERE value IN (${sql.join(
            params.tags.map((t) => sql`${t}`),
            sql`, `
          )}))`
        : undefined

    const where = tagFilter ? and(...conditions, tagFilter) : and(...conditions)
    const sortColumn = SORT_COLUMNS[params.sortBy ?? ''] ?? DEFAULT_SORT_COLUMN
    const direction = params.sortDirection === 'desc' ? desc(sortColumn) : asc(sortColumn)
    const offset = (params.page - 1) * params.pageSize

    const [{ count }] = this.db
      .select({ count: sql<number>`count(*)` })
      .from(cuts)
      .where(where)
      .all()

    const rows = this.db
      .select()
      .from(cuts)
      .where(where)
      .orderBy(direction)
      .limit(params.pageSize)
      .offset(offset)
      .all()
      .map(mapRowToCut)

    return paginatedResult(rows, count, params)
  }
}
