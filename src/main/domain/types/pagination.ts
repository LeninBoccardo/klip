import type { PaginationParams, PaginatedResult } from '@shared/types'

/** Re-exported from shared — canonical definitions live in @shared/types */
export type { SortDirection, PaginationParams, PaginatedResult } from '@shared/types'

/** Build a PaginatedResult from a data array and total count */
export function paginatedResult<T>(
  data: T[],
  total: number,
  params: PaginationParams
): PaginatedResult<T> {
  const safePageSize = Math.max(1, params.pageSize)
  return {
    data,
    total,
    page: Math.max(1, params.page),
    pageSize: safePageSize,
    totalPages: Math.max(1, Math.ceil(total / safePageSize))
  }
}
