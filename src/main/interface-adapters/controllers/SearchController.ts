import type { ISearchAll } from '@use-cases/ISearchAll'
import { createTypedHandler } from './create-typed-handler'

/**
 * IPC controller for the global command palette.
 *
 * Registers:
 *   - `search-all` → grouped results across creators, videos, cuts, and tags
 */
export function registerSearchController(searchAll: ISearchAll): void {
  createTypedHandler('search-all', async (_event, query, limit) => {
    return searchAll.execute(query, limit)
  })
}
