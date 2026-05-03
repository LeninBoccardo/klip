import type { ISearchAll } from '@use-cases/ISearchAll'
import type { ISearchTranscripts } from '@use-cases/ISearchTranscripts'
import { createTypedHandler } from './create-typed-handler'

/**
 * IPC controller for the global command palette and transcript FTS.
 *
 * Registers:
 *   - `search-all`         → grouped results across creators, videos, cuts, and tags
 *   - `search-transcripts` → ranked FTS5 phrase matches with snippets
 */
export function registerSearchController(
  searchAll: ISearchAll,
  searchTranscripts: ISearchTranscripts
): void {
  createTypedHandler('search-all', async (_event, query, limit) => {
    return searchAll.execute(query, limit)
  })

  createTypedHandler('search-transcripts', async (_event, params) => {
    return searchTranscripts.execute(params)
  })
}
