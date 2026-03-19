import type BetterSqlite3 from 'better-sqlite3'
import type { Cut } from '@domain/entities'
import type { ICutRepository, CutQueryParams } from '@domain/repositories'
import type { PaginatedResult, EntityStatus } from '@domain/types'
import { paginatedResult } from '@domain/types'

// ── sort-column allowlist (camelCase UI key → snake_case DB column) ──

const CUT_SORT_COLUMNS: Record<string, string> = {
  title: 'title',
  duration: 'duration',
  fileSize: 'file_size',
  startTimestamp: 'start_timestamp',
  endTimestamp: 'end_timestamp',
  status: 'status',
  createdAt: 'created_at',
  updatedAt: 'updated_at'
}
const DEFAULT_SORT_COLUMN = 'created_at'

const ALL_COLUMNS = `id, creator_id, video_id, title, tags, start_timestamp, end_timestamp,
                duration, resolution, file_size, file_path, thumbnail_path,
                status, deleted_at, created_at, updated_at`

export class SqliteCutRepository implements ICutRepository {
  constructor(private db: BetterSqlite3.Database) {}

  findAll(): Cut[] {
    const rows = this.db
      .prepare(`SELECT ${ALL_COLUMNS} FROM cuts ORDER BY created_at DESC`)
      .all() as RawCutRow[]

    return rows.map(mapRowToCut)
  }

  findAllActive(): Cut[] {
    const rows = this.db
      .prepare(`SELECT ${ALL_COLUMNS} FROM cuts WHERE status = 'active' ORDER BY created_at DESC`)
      .all() as RawCutRow[]

    return rows.map(mapRowToCut)
  }

  findById(id: string): Cut | null {
    const row = this.db
      .prepare(`SELECT ${ALL_COLUMNS} FROM cuts WHERE id = ?`)
      .get(id) as RawCutRow | undefined

    return row ? mapRowToCut(row) : null
  }

  findByCreatorId(creatorId: string): Cut[] {
    const rows = this.db
      .prepare(
        `SELECT ${ALL_COLUMNS}
         FROM cuts WHERE creator_id = ? AND status = 'active' ORDER BY created_at DESC`
      )
      .all(creatorId) as RawCutRow[]

    return rows.map(mapRowToCut)
  }

  findByVideoId(videoId: string): Cut[] {
    const rows = this.db
      .prepare(
        `SELECT ${ALL_COLUMNS}
         FROM cuts WHERE video_id = ? AND status = 'active' ORDER BY created_at DESC`
      )
      .all(videoId) as RawCutRow[]

    return rows.map(mapRowToCut)
  }

  findByTags(tags: string[]): Cut[] {
    if (tags.length === 0) return []

    const placeholders = tags.map(() => '?').join(', ')
    const rows = this.db
      .prepare(
        `SELECT DISTINCT c.id, c.creator_id, c.video_id, c.title, c.tags,
                c.start_timestamp, c.end_timestamp, c.duration, c.resolution,
                c.file_size, c.file_path, c.thumbnail_path,
                c.status, c.deleted_at, c.created_at, c.updated_at
         FROM cuts c, json_each(c.tags) AS t
         WHERE c.status = 'active' AND t.value IN (${placeholders})
         ORDER BY c.created_at DESC`
      )
      .all(...tags) as RawCutRow[]

    return rows.map(mapRowToCut)
  }

  upsert(cut: Cut): void {
    this.db
      .prepare(
        `INSERT INTO cuts (id, creator_id, video_id, title, tags, start_timestamp, end_timestamp,
                           duration, resolution, file_size, file_path, thumbnail_path,
                           status, deleted_at, created_at, updated_at)
         VALUES (@id, @creatorId, @videoId, @title, @tags, @startTimestamp, @endTimestamp,
                 @duration, @resolution, @fileSize, @filePath, @thumbnailPath,
                 @status, @deletedAt, @createdAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           creator_id      = excluded.creator_id,
           video_id        = excluded.video_id,
           title           = excluded.title,
           tags            = excluded.tags,
           start_timestamp = excluded.start_timestamp,
           end_timestamp   = excluded.end_timestamp,
           duration        = excluded.duration,
           resolution      = excluded.resolution,
           file_size       = excluded.file_size,
           file_path       = excluded.file_path,
           thumbnail_path  = excluded.thumbnail_path,
           status          = excluded.status,
           deleted_at      = excluded.deleted_at,
           updated_at      = excluded.updated_at`
      )
      .run({
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
        status: cut.status,
        deletedAt: cut.deletedAt,
        createdAt: cut.createdAt,
        updatedAt: cut.updatedAt
      })
  }

  updateStatus(id: string, status: EntityStatus, deletedAt: string | null): void {
    this.db
      .prepare(
        `UPDATE cuts SET status = ?, deleted_at = ?, updated_at = datetime('now') WHERE id = ?`
      )
      .run(status, deletedAt, id)
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM cuts WHERE id = ?').run(id)
  }

  findPaginated(params: CutQueryParams): PaginatedResult<Cut> {
    const conditions: string[] = []
    const bindings: unknown[] = []

    // Status filter — defaults to ['active']
    const statuses = params.status && params.status.length > 0 ? params.status : ['active']
    const statusPlaceholders = statuses.map(() => '?').join(', ')
    conditions.push(`status IN (${statusPlaceholders})`)
    bindings.push(...statuses)

    if (params.creatorId) {
      conditions.push('creator_id = ?')
      bindings.push(params.creatorId)
    }

    if (params.videoId) {
      conditions.push('video_id = ?')
      bindings.push(params.videoId)
    }

    if (params.tags && params.tags.length > 0) {
      const tagPlaceholders = params.tags.map(() => '?').join(', ')
      conditions.push(
        `EXISTS (SELECT 1 FROM json_each(cuts.tags) WHERE value IN (${tagPlaceholders}))`
      )
      bindings.push(...params.tags)
    }

    if (params.search) {
      conditions.push('title LIKE ?')
      bindings.push(`%${params.search}%`)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const sortCol = CUT_SORT_COLUMNS[params.sortBy ?? ''] ?? DEFAULT_SORT_COLUMN
    const sortDir = params.sortDirection === 'desc' ? 'DESC' : 'ASC'
    const offset = (params.page - 1) * params.pageSize

    const total = (
      this.db.prepare(`SELECT COUNT(*) AS count FROM cuts ${where}`).get(...bindings) as {
        count: number
      }
    ).count

    const rows = this.db
      .prepare(
        `SELECT ${ALL_COLUMNS}
         FROM cuts ${where}
         ORDER BY ${sortCol} ${sortDir}
         LIMIT ? OFFSET ?`
      )
      .all(...bindings, params.pageSize, offset) as RawCutRow[]

    return paginatedResult(rows.map(mapRowToCut), total, params)
  }
}

// ── internal helpers ──

interface RawCutRow {
  id: string
  creator_id: string
  video_id: string | null
  title: string
  tags: string
  start_timestamp: number | null
  end_timestamp: number | null
  duration: number | null
  resolution: string | null
  file_size: number | null
  file_path: string
  thumbnail_path: string | null
  status: string
  deleted_at: string | null
  created_at: string
  updated_at: string
}

function mapRowToCut(row: RawCutRow): Cut {
  return {
    id: row.id,
    creatorId: row.creator_id,
    videoId: row.video_id,
    title: row.title,
    tags: JSON.parse(row.tags) as string[],
    startTimestamp: row.start_timestamp,
    endTimestamp: row.end_timestamp,
    duration: row.duration,
    resolution: row.resolution,
    fileSize: row.file_size,
    filePath: row.file_path,
    thumbnailPath: row.thumbnail_path,
    status: row.status as EntityStatus,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
