import { eq, and, inArray, asc, desc, sql } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { AppDatabase } from '@main/framework-drivers/database'
import { videos } from '@main/framework-drivers/database/schema'
import type { Video } from '@domain/entities'
import type { IVideoRepository, VideoQueryParams } from '@domain/repositories'
import type { PaginatedResult, EntityStatus, ProbeStatus } from '@domain/types'
import { paginatedResult } from '@domain/types'
import { escapeLike } from './escape-like'

// ── sort-column allowlist (camelCase UI key → Drizzle column reference) ──

const SORT_COLUMNS: Record<string, SQLiteColumn> = {
  title: videos.title,
  duration: videos.duration,
  fileSize: videos.fileSize,
  viewCount: videos.viewCount,
  downloadDate: videos.downloadDate,
  status: videos.status,
  createdAt: videos.createdAt,
  updatedAt: videos.updatedAt
}
const DEFAULT_SORT_COLUMN = videos.createdAt

type VideoRow = typeof videos.$inferSelect

function mapRow(row: VideoRow): Video {
  return { ...row, status: row.status as EntityStatus, probeStatus: row.probeStatus as ProbeStatus }
}

export class SqliteVideoRepository implements IVideoRepository {
  constructor(private db: AppDatabase) {}

  findAll(): Video[] {
    return this.db.select().from(videos).orderBy(desc(videos.createdAt)).all().map(mapRow)
  }

  findAllActive(): Video[] {
    return this.db
      .select()
      .from(videos)
      .where(eq(videos.status, 'active'))
      .orderBy(desc(videos.createdAt))
      .all()
      .map(mapRow)
  }

  findById(id: string): Video | null {
    const row = this.db.select().from(videos).where(eq(videos.id, id)).get()
    return row ? mapRow(row) : null
  }

  findByCreatorId(creatorId: string): Video[] {
    return this.db
      .select()
      .from(videos)
      .where(eq(videos.creatorId, creatorId))
      .orderBy(desc(videos.createdAt))
      .all()
      .map(mapRow)
  }

  findByProbeStatus(status: ProbeStatus): Video[] {
    return this.db
      .select()
      .from(videos)
      .where(eq(videos.probeStatus, status))
      .orderBy(asc(videos.createdAt))
      .all()
      .map(mapRow)
  }

  upsert(video: Video): void {
    this.db
      .insert(videos)
      .values({
        id: video.id,
        creatorId: video.creatorId,
        title: video.title,
        url: video.url,
        duration: video.duration,
        resolution: video.resolution,
        fileSize: video.fileSize,
        filePath: video.filePath,
        thumbnailPath: video.thumbnailPath,
        downloadDate: video.downloadDate,
        probeStatus: video.probeStatus,
        viewCount: video.viewCount,
        status: video.status,
        deletedAt: video.deletedAt,
        createdAt: video.createdAt,
        updatedAt: video.updatedAt
      })
      .onConflictDoUpdate({
        target: videos.id,
        set: {
          creatorId: sql`excluded.creator_id`,
          title: sql`excluded.title`,
          url: sql`excluded.url`,
          duration: sql`excluded.duration`,
          resolution: sql`excluded.resolution`,
          fileSize: sql`excluded.file_size`,
          filePath: sql`excluded.file_path`,
          thumbnailPath: sql`excluded.thumbnail_path`,
          downloadDate: sql`excluded.download_date`,
          probeStatus: sql`excluded.probe_status`,
          viewCount: sql`excluded.view_count`,
          status: sql`excluded.status`,
          deletedAt: sql`excluded.deleted_at`,
          updatedAt: sql`excluded.updated_at`
        }
      })
      .run()
  }

  updateStatus(id: string, status: EntityStatus, deletedAt: string | null): void {
    this.db
      .update(videos)
      .set({ status, deletedAt, updatedAt: new Date().toISOString() })
      .where(eq(videos.id, id))
      .run()
  }

  updateProbeStatus(id: string, probeStatus: ProbeStatus): void {
    this.db
      .update(videos)
      .set({ probeStatus, updatedAt: new Date().toISOString() })
      .where(eq(videos.id, id))
      .run()
  }

  delete(id: string): void {
    this.db.delete(videos).where(eq(videos.id, id)).run()
  }

  updateFilePathPrefix(oldPrefix: string, newPrefix: string): void {
    // Anchored prefix replacement via substr() — `replace()` is global and would
    // rewrite mid-path occurrences of oldPrefix as well.
    this.db
      .update(videos)
      .set({
        filePath: sql`${newPrefix} || substr(${videos.filePath}, length(${oldPrefix}) + 1)`,
        thumbnailPath: sql`CASE WHEN ${videos.thumbnailPath} IS NOT NULL AND substr(${videos.thumbnailPath}, 1, length(${oldPrefix})) = ${oldPrefix} THEN ${newPrefix} || substr(${videos.thumbnailPath}, length(${oldPrefix}) + 1) ELSE ${videos.thumbnailPath} END`,
        updatedAt: new Date().toISOString()
      })
      .where(sql`${videos.filePath} LIKE ${oldPrefix + '%'}`)
      .run()
  }

  findPaginated(params: VideoQueryParams): PaginatedResult<Video> {
    const statuses = params.status && params.status.length > 0 ? params.status : ['active']
    const conditions = [inArray(videos.status, statuses)]

    if (params.creatorId) {
      conditions.push(eq(videos.creatorId, params.creatorId))
    }

    if (params.search) {
      conditions.push(
        sql`${videos.title} LIKE ${'%' + escapeLike(params.search) + '%'} ESCAPE '\\'`
      )
    }

    const where = and(...conditions)
    const sortColumn = SORT_COLUMNS[params.sortBy ?? ''] ?? DEFAULT_SORT_COLUMN
    const direction = params.sortDirection === 'desc' ? desc(sortColumn) : asc(sortColumn)
    const offset = (params.page - 1) * params.pageSize

    const [{ count }] = this.db
      .select({ count: sql<number>`count(*)` })
      .from(videos)
      .where(where)
      .all()

    const rows = this.db
      .select()
      .from(videos)
      .where(where)
      .orderBy(direction)
      .limit(params.pageSize)
      .offset(offset)
      .all()

    return paginatedResult(rows.map(mapRow), count, params)
  }
}
