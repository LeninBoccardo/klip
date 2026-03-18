import type BetterSqlite3 from 'better-sqlite3'
import type { Creator } from '@domain/entities'
import type { ICreatorRepository } from '@domain/repositories'

export class SqliteCreatorRepository implements ICreatorRepository {
  constructor(private db: BetterSqlite3.Database) {}

  findAll(): Creator[] {
    const rows = this.db
      .prepare(
        `SELECT id, name, profile_image_path, created_at, updated_at
         FROM creators ORDER BY name ASC`
      )
      .all() as RawCreatorRow[]

    return rows.map(mapRowToCreator)
  }

  findById(id: string): Creator | null {
    const row = this.db
      .prepare(
        `SELECT id, name, profile_image_path, created_at, updated_at
         FROM creators WHERE id = ?`
      )
      .get(id) as RawCreatorRow | undefined

    return row ? mapRowToCreator(row) : null
  }

  upsert(creator: Creator): void {
    this.db
      .prepare(
        `INSERT INTO creators (id, name, profile_image_path, created_at, updated_at)
         VALUES (@id, @name, @profileImagePath, @createdAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           name              = excluded.name,
           profile_image_path = excluded.profile_image_path,
           updated_at         = excluded.updated_at`
      )
      .run({
        id: creator.id,
        name: creator.name,
        profileImagePath: creator.profileImagePath,
        createdAt: creator.createdAt,
        updatedAt: creator.updatedAt
      })
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM creators WHERE id = ?').run(id)
  }
}

// ── internal helpers ──

interface RawCreatorRow {
  id: string
  name: string
  profile_image_path: string | null
  created_at: string
  updated_at: string
}

function mapRowToCreator(row: RawCreatorRow): Creator {
  return {
    id: row.id,
    name: row.name,
    profileImagePath: row.profile_image_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
