import type BetterSqlite3 from 'better-sqlite3'
import type { Video } from '@domain/entities'
import type { IVideoRepository } from '@domain/repositories'

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
