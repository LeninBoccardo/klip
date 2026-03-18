import type BetterSqlite3 from 'better-sqlite3'
import type { Creator } from '@domain/entities'
import type { ICreatorRepository } from '@domain/repositories'
import type { PaginationParams, PaginatedResult } from '@domain/types'
import { paginatedResult } from '@domain/types'

// ── sort-column allowlist (camelCase UI key → snake_case DB column) ──

const CREATOR_SORT_COLUMNS: Record<string, string> = {
  name: 'name',
  createdAt: 'created_at',
  updatedAt: 'updated_at'
}
const DEFAULT_SORT_COLUMN = 'name'

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

  findPaginated(params: PaginationParams): PaginatedResult<Creator> {
    const conditions: string[] = []
    const bindings: unknown[] = []

    if (params.search) {
      conditions.push('name LIKE ?')
      bindings.push(`%${params.search}%`)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const sortCol = CREATOR_SORT_COLUMNS[params.sortBy ?? ''] ?? DEFAULT_SORT_COLUMN
    const sortDir = params.sortDirection === 'desc' ? 'DESC' : 'ASC'
    const offset = (params.page - 1) * params.pageSize

    const total = (
      this.db.prepare(`SELECT COUNT(*) AS count FROM creators ${where}`).get(...bindings) as {
        count: number
      }
    ).count

    const rows = this.db
      .prepare(
        `SELECT id, name, profile_image_path, created_at, updated_at
         FROM creators ${where}
         ORDER BY ${sortCol} ${sortDir}
         LIMIT ? OFFSET ?`
      )
      .all(...bindings, params.pageSize, offset) as RawCreatorRow[]

    return paginatedResult(rows.map(mapRowToCreator), total, params)
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
