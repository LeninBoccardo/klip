import type { EntityStatus } from './entity-status'

/** Sort direction */
export type SortDirection = 'asc' | 'desc'

/** Generic paginated query parameters sent by the UI */
export interface PaginationParams {
  /** 1-based page number */
  page: number
  /** Rows per page */
  pageSize: number
  /** Column to sort by (entity-specific, validated at the adapter layer) */
  sortBy?: string
  /** Sort direction, defaults to 'asc' */
  sortDirection?: SortDirection
  /** Free-text search term applied to relevant text columns */
  search?: string
  /** Filter by entity status. Defaults to ['active'] when omitted. */
  status?: EntityStatus[]
}

/** Generic paginated result returned to the UI */
export interface PaginatedResult<T> {
  /** Rows for the current page */
  data: T[]
  /** Total row count matching the filters (before pagination) */
  total: number
  /** Current page (mirrors input) */
  page: number
  /** Page size (mirrors input) */
  pageSize: number
  /** Convenience: total number of pages */
  totalPages: number
}

/** Paginated query params for videos (extends PaginationParams) */
export interface VideoQueryParams extends PaginationParams {
  creatorId?: string
}

/** Paginated query params for cuts (extends PaginationParams) */
export interface CutQueryParams extends PaginationParams {
  creatorId?: string
  videoId?: string
  tags?: string[]
}
