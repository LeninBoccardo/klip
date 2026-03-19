import type BetterSqlite3 from 'better-sqlite3'
import type { Creator } from '@domain/entities'
import type { ICreatorRepository } from '@domain/repositories'
import type { PaginationParams, PaginatedResult, EntityStatus } from '@domain/types'
import { paginatedResult } from '@domain/types'

// ── sort-column allowlist (camelCase UI key → snake_case DB column) ──

const CREATOR_SORT_COLUMNS: Record<string, string> = {
  name: 'name',
  status: 'status',
  createdAt: 'created_at',
  updatedAt: 'updated_at'
}
const DEFAULT_SORT_COLUMN = 'name'

const ALL_COLUMNS = `id, name, profile_image_path, status, deleted_at, created_at, updated_at`

export class SqliteCreatorRepository implements ICreatorRepository {
  constructor(private db: BetterSqlite3.Database) {}

  findAll(): Creator[] {
    const rows = this.db
      .prepare(`SELECT ${ALL_COLUMNS} FROM creators ORDER BY name ASC`)
      .all() as RawCreatorRow[]

    return rows.map(mapRowToCreator)
  }

  findAllActive(): Creator[] {
    const rows = this.db
      .prepare(`SELECT ${ALL_COLUMNS} FROM creators WHERE status = 'active' ORDER BY name ASC`)
      .all() as RawCreatorRow[]

    return rows.map(mapRowToCreator)
  }

  findById(id: string): Creator | null {
    const row = this.db.prepare(`SELECT ${ALL_COLUMNS} FROM creators WHERE id = ?`).get(id) as
      | RawCreatorRow
      | undefined

    return row ? mapRowToCreator(row) : null
  }

  upsert(creator: Creator): void {
    this.db
      .prepare(
        `INSERT INTO creators (id, name, profile_image_path, status, deleted_at, created_at, updated_at)
         VALUES (@id, @name, @profileImagePath, @status, @deletedAt, @createdAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           name               = excluded.name,
           profile_image_path = excluded.profile_image_path,
           status             = excluded.status,
           deleted_at         = excluded.deleted_at,
           updated_at         = excluded.updated_at`
      )
      .run({
        id: creator.id,
        name: creator.name,
        profileImagePath: creator.profileImagePath,
        status: creator.status,
        deletedAt: creator.deletedAt,
        createdAt: creator.createdAt,
        updatedAt: creator.updatedAt
      })
  }

  updateStatus(id: string, status: EntityStatus, deletedAt: string | null): void {
    this.db
      .prepare(
        `UPDATE creators SET status = ?, deleted_at = ?, updated_at = datetime('now') WHERE id = ?`
      )
      .run(status, deletedAt, id)
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM creators WHERE id = ?').run(id)
  }

  findPaginated(params: PaginationParams): PaginatedResult<Creator> {
    const conditions: string[] = []
    const bindings: unknown[] = []

    // Status filter — defaults to ['active']
    const statuses = params.status && params.status.length > 0 ? params.status : ['active']
    const statusPlaceholders = statuses.map(() => '?').join(', ')
    conditions.push(`status IN (${statusPlaceholders})`)
    bindings.push(...statuses)

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
        `SELECT ${ALL_COLUMNS}
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
  status: string
  deleted_at: string | null
  created_at: string
  updated_at: string
}

function mapRowToCreator(row: RawCreatorRow): Creator {
  return {
    id: row.id,
    name: row.name,
    profileImagePath: row.profile_image_path,
    status: row.status as EntityStatus,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
