import type { CollectionDto } from '@shared/dtos'
import type { PaginationParams, PaginatedResult } from '@shared/types'

/**
 * Paginated list of collections enriched with `itemCount` (sum of join-row
 * counts for each id). Listed separately so the row-count subqueries don't
 * leak into `ICollectionRepository.findPaginated` and pollute non-DTO call
 * sites.
 */
export interface IGetCollectionsPaginated {
  execute(params: PaginationParams): PaginatedResult<CollectionDto>
}
