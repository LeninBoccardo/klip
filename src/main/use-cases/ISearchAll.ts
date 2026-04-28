import type { SearchAllResult } from '@shared/types'

/**
 * Cross-entity search across creators, videos, cuts, and tags.
 *
 * Backs the global command palette (Cmd/Ctrl+K). Returns grouped results so
 * the renderer can render fixed sections without re-slicing. The use case
 * caps each surface independently — a creator-heavy query won't starve
 * videos/cuts out of the response.
 */
export interface ISearchAll {
  /**
   * @param query  Trimmed in the use case; an empty/whitespace string returns
   *               the empty grouped result without touching the repos.
   * @param limit  Per-surface cap. Defaults to a small number suited for a
   *               palette UI; overridable for callers that want more.
   */
  execute(query: string, limit?: number): SearchAllResult
}
