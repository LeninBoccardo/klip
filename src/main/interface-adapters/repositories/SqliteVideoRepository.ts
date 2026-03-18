import type BetterSqlite3 from 'better-sqlite3'
import type { Video } from '@domain/entities'
import type { IVideoRepository, VideoQueryParams } from '@domain/repositories'
import type { PaginatedResult } from '@domain/types'
import { paginatedResult } from '@domain/types'

// ── sort-column allowlist (camelCase UI key → snake_case DB column) ──

const VIDEO_SORT_COLUMNS: Record<string, string> = {
  title: 'title',
  duration: 'duration',
  fileSize: 'file_size',
  downloadDate: 'download_date',
  createdAt: 'created_at',
  updatedAt: 'updated_at'
}
const DEFAULT_SORT_COLUMN = 'created_at'

export class SqliteVideoRepository implements IVideoRepository {
  constructor(private db: BetterSqlite3.Database) {}

  findAll(): Video[] {
    const rows = this.db
      .prepare(
        `SELECT id, creator_id, title, url, duration, resolution, file_size,
                file_path, thumbnail_path, download_date, created_at, updated_at
         FROM videos ORDER BY created_at DESC`
      )
      .all() as RawVideoRow[]

    return rows.map(mapRowToVideo)
  }

  findById(id: string): Video | null {
    const row = this.db
      .prepare(
        `SELECT id, creator_id, title, url, duration, resolution, file_size,
                file_path, thumbnail_path, download_date, created_at, updated_at
         FROM videos WHERE id = ?`
      )
      .get(id) as RawVideoRow | undefined

    return row ? mapRowToVideo(row) : null
  }

  findByCreatorId(creatorId: string): Video[] {
    const rows = this.db
      .prepare(
        `SELECT id, creator_id, title, url, duration, resolution, file_size,
                file_path, thumbnail_path, download_date, created_at, updated_at
         FROM videos WHERE creator_id = ? ORDER BY created_at DESC`
      )
      .all(creatorId) as RawVideoRow[]

    return rows.map(mapRowToVideo)
  }

  upsert(video: Video): void {
    this.db
      .prepare(
        `INSERT INTO videos (id, creator_id, title, url, duration, resolution, file_size,
                             file_path, thumbnail_path, download_date, created_at, updated_at)
         VALUES (@id, @creatorId, @title, @url, @duration, @resolution, @fileSize,
                 @filePath, @thumbnailPath, @downloadDate, @createdAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           creator_id     = excluded.creator_id,
           title          = excluded.title,
           url            = excluded.url,
           duration       = excluded.duration,
           resolution     = excluded.resolution,
           file_size      = excluded.file_size,
           file_path      = excluded.file_path,
           thumbnail_path = excluded.thumbnail_path,
           download_date  = excluded.download_date,
           updated_at     = excluded.updated_at`
      )
      .run({
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
        createdAt: video.createdAt,
        updatedAt: video.updatedAt
      })
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM videos WHERE id = ?').run(id)
  }

  findPaginated(params: VideoQueryParams): PaginatedResult<Video> {
    const conditions: string[] = []
    const bindings: unknown[] = []

    if (params.creatorId) {
      conditions.push('creator_id = ?')
      bindings.push(params.creatorId)
    }

    if (params.search) {
      conditions.push('title LIKE ?')
      bindings.push(`%${params.search}%`)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const sortCol = VIDEO_SORT_COLUMNS[params.sortBy ?? ''] ?? DEFAULT_SORT_COLUMN
    const sortDir = params.sortDirection === 'desc' ? 'DESC' : 'ASC'
    const offset = (params.page - 1) * params.pageSize

    const total = (
      this.db.prepare(`SELECT COUNT(*) AS count FROM videos ${where}`).get(...bindings) as {
        count: number
      }
    ).count

    const rows = this.db
      .prepare(
        `SELECT id, creator_id, title, url, duration, resolution, file_size,
                file_path, thumbnail_path, download_date, created_at, updated_at
         FROM videos ${where}
         ORDER BY ${sortCol} ${sortDir}
         LIMIT ? OFFSET ?`
      )
      .all(...bindings, params.pageSize, offset) as RawVideoRow[]

    return paginatedResult(rows.map(mapRowToVideo), total, params)
  }
}

// ── internal helpers ──

interface RawVideoRow {
  id: string
  creator_id: string
  title: string
  url: string | null
  duration: number | null
  resolution: string | null
  file_size: number | null
  file_path: string
  thumbnail_path: string | null
  download_date: string | null
  created_at: string
  updated_at: string
}

function mapRowToVideo(row: RawVideoRow): Video {
  return {
    id: row.id,
    creatorId: row.creator_id,
    title: row.title,
    url: row.url,
    duration: row.duration,
    resolution: row.resolution,
    fileSize: row.file_size,
    filePath: row.file_path,
    thumbnailPath: row.thumbnail_path,
    downloadDate: row.download_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
