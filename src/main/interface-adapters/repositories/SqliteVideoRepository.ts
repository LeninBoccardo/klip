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
  likeCount: videos.likeCount,
  uploadDate: videos.uploadDate,
  downloadDate: videos.downloadDate,
  status: videos.status,
  createdAt: videos.createdAt,
  updatedAt: videos.updatedAt
}
const DEFAULT_SORT_COLUMN = videos.createdAt

type VideoRow = typeof videos.$inferSelect

function mapRow(row: VideoRow): Video {
  let parsedTags: string[] = []
  try {
    const t = JSON.parse((row.tags as string) ?? '[]')
    if (Array.isArray(t)) parsedTags = t.filter((x): x is string => typeof x === 'string')
  } catch {
    parsedTags = []
  }
  return {
    ...row,
    tags: parsedTags,
    status: row.status as EntityStatus,
    probeStatus: row.probeStatus as ProbeStatus
  }
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

  findIdsByCreator(creatorId: string): string[] {
    return this.db
      .select({ id: videos.id })
      .from(videos)
      .where(eq(videos.creatorId, creatorId))
      .all()
      .map((r) => r.id)
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

  findByTags(tags: string[]): Video[] {
    if (tags.length === 0) return []

    const tagValues = sql.join(
      tags.map((t) => sql`${t}`),
      sql`, `
    )

    const rows = this.db.all(
      sql`SELECT DISTINCT v.*
          FROM videos v, json_each(v.tags) AS t
          WHERE v.status = 'active' AND t.value IN (${tagValues})
          ORDER BY v.created_at DESC`
    ) as VideoRow[]

    return rows.map(mapRow)
  }

  searchByTitle(query: string, limit: number): Video[] {
    const trimmed = query.trim()
    if (trimmed.length === 0 || limit <= 0) return []

    const pattern = `%${escapeLike(trimmed)}%`
    return this.db
      .select()
      .from(videos)
      .where(and(eq(videos.status, 'active'), sql`${videos.title} LIKE ${pattern} ESCAPE '\\'`))
      .orderBy(desc(videos.createdAt))
      .limit(limit)
      .all()
      .map(mapRow)
  }

  getAllDistinctTags(): { tag: string; count: number }[] {
    // SQLite's json_each emits one row per tag in each video's JSON array.
    // Grouping by the tag value gives a per-tag count of *videos*; multiple
    // occurrences inside the same row would inflate the count, but `parseTags`
    // deduplicates on read so the schema invariant is "no duplicates per row".
    const rows = this.db.all(
      sql`SELECT t.value AS tag, COUNT(DISTINCT v.id) AS count
          FROM videos v, json_each(v.tags) AS t
          WHERE v.status = 'active'
          GROUP BY t.value
          ORDER BY count DESC, tag ASC`
    ) as Array<{ tag: string; count: number }>

    return rows
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
        likeCount: video.likeCount,
        dislikeCount: video.dislikeCount,
        commentCount: video.commentCount,
        category: video.category,
        tags: JSON.stringify(video.tags ?? []),
        uploadDate: video.uploadDate,
        description: video.description,
        isShort: video.isShort,
        transcriptPath: video.transcriptPath,
        transcriptText: video.transcriptText,
        detailFetchedAt: video.detailFetchedAt,
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
          likeCount: sql`excluded.like_count`,
          dislikeCount: sql`excluded.dislike_count`,
          commentCount: sql`excluded.comment_count`,
          category: sql`excluded.category`,
          tags: sql`excluded.tags`,
          uploadDate: sql`excluded.upload_date`,
          description: sql`excluded.description`,
          isShort: sql`excluded.is_short`,
          transcriptPath: sql`excluded.transcript_path`,
          transcriptText: sql`excluded.transcript_text`,
          detailFetchedAt: sql`excluded.detail_fetched_at`,
          status: sql`excluded.status`,
          deletedAt: sql`excluded.deleted_at`,
          updatedAt: sql`excluded.updated_at`
        }
      })
      .run()
  }

  /** Inner repos don't track audit history, so the prior state is irrelevant. */
  upsertWithPrevious(video: Video, _previous: Video | null): void {
    this.upsert(video)
  }

  /**
   * Returns videos that have a YouTube URL but have not had detail metadata
   * fetched yet (detail_fetched_at IS NULL). Used by EnrichAllVideos.
   */
  findNeedingDetail(): Video[] {
    return this.db
      .select()
      .from(videos)
      .where(
        and(
          eq(videos.status, 'active'),
          sql`${videos.url} IS NOT NULL`,
          sql`${videos.detailFetchedAt} IS NULL`
        )
      )
      .orderBy(asc(videos.createdAt))
      .all()
      .map(mapRow)
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
      // Escape LIKE wildcards (% and _) in the prefix so a path containing
      // those literal characters can't accidentally match unrelated rows.
      // ESCAPE '\\' pairs with `escapeLike`'s backslash convention.
      .where(sql`${videos.filePath} LIKE ${escapeLike(oldPrefix) + '%'} ESCAPE '\\'`)
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

    // Secondary `id DESC` tiebreaker so rows that share the primary sort key
    // (e.g. identical `createdAt` timestamps when seeded from a script, or
    // many rows with the same status) get a stable order across page
    // boundaries. Without it, SQLite is free to reorder ties and a row could
    // appear on two pages or none.
    const rows = this.db
      .select()
      .from(videos)
      .where(where)
      .orderBy(direction, desc(videos.id))
      .limit(params.pageSize)
      .offset(offset)
      .all()

    return paginatedResult(rows.map(mapRow), count, params)
  }

  // ── Aggregates ──

  count(): number {
    const [{ count }] = this.db
      .select({ count: sql<number>`count(*)` })
      .from(videos)
      .where(eq(videos.status, 'active'))
      .all()
    return count
  }

  countByStatus(): Partial<Record<EntityStatus, number>> {
    const rows = this.db
      .select({ status: videos.status, count: sql<number>`count(*)` })
      .from(videos)
      .groupBy(videos.status)
      .all()
    const out: Partial<Record<EntityStatus, number>> = {}
    for (const row of rows) {
      out[row.status as EntityStatus] = row.count
    }
    return out
  }

  countTranscribed(): number {
    const [{ count }] = this.db
      .select({ count: sql<number>`count(*)` })
      .from(videos)
      .where(
        and(eq(videos.status, 'active'), sql`${videos.transcriptText} IS NOT NULL`)
      )
      .all()
    return count
  }

  sumDuration(): number {
    const [{ total }] = this.db
      .select({ total: sql<number>`coalesce(sum(${videos.duration}), 0)` })
      .from(videos)
      .where(eq(videos.status, 'active'))
      .all()
    return total
  }

  sumFileSize(): number {
    const [{ total }] = this.db
      .select({ total: sql<number>`coalesce(sum(${videos.fileSize}), 0)` })
      .from(videos)
      .where(eq(videos.status, 'active'))
      .all()
    return total
  }

  findDownloadCountsByDay(days: number): { date: string; count: number }[] {
    if (days <= 0) return []
    // Group active videos by the date portion of `downloadDate` (an ISO string
    // stored as TEXT). SQLite's `substr` is stable since the format is fixed
    // by `new Date().toISOString()`.
    const rows = this.db
      .select({
        date: sql<string>`substr(${videos.downloadDate}, 1, 10)`,
        count: sql<number>`count(*)`
      })
      .from(videos)
      .where(
        and(
          eq(videos.status, 'active'),
          sql`${videos.downloadDate} IS NOT NULL`,
          sql`date(${videos.downloadDate}) >= date('now', ${`-${days - 1} days`})`
        )
      )
      .groupBy(sql`substr(${videos.downloadDate}, 1, 10)`)
      .all()

    // Zero-fill: build a Map keyed by date, then enumerate the last `days`
    // dates in ascending order so the renderer can plot a contiguous line.
    const counts = new Map<string, number>()
    for (const row of rows) counts.set(row.date, row.count)

    const out: { date: string; count: number }[] = []
    const today = new Date()
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(today)
      d.setUTCDate(today.getUTCDate() - i)
      const iso = d.toISOString().slice(0, 10)
      out.push({ date: iso, count: counts.get(iso) ?? 0 })
    }
    return out
  }

  findTopCreators(limit: number): { creatorId: string; videoCount: number }[] {
    if (limit <= 0) return []
    return this.db
      .select({
        creatorId: videos.creatorId,
        videoCount: sql<number>`count(*)`
      })
      .from(videos)
      .where(eq(videos.status, 'active'))
      .groupBy(videos.creatorId)
      .orderBy(sql`count(*) desc`)
      .limit(limit)
      .all()
  }
}
