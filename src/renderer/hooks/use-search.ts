import { useEffect, useState } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import type { SearchAllResult, TranscriptSearchResult } from '@shared/types'

const DEFAULT_DEBOUNCE_MS = 200
const DEFAULT_LIMIT = 8

/**
 * Debounces a string value. Used by the command palette so we don't fire an
 * IPC call on every keystroke. Returns the latest stable value after `ms` of
 * inactivity. The internal state is initialised to the current input so the
 * very first render is already in sync (no `''` flash before the first tick).
 */
function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(handle)
  }, [value, ms])

  return debounced
}

interface UseSearchAllOptions {
  /** Debounce window applied to `query` before firing the IPC call. */
  debounceMs?: number
  /** Per-surface cap on the result size. */
  limit?: number
}

/**
 * Reactive global search hook. Debounces the input, then issues a single
 * cross-entity search query against the main process. Empty/whitespace
 * queries short-circuit to a disabled query so the cache doesn't churn
 * while the palette is open but unused.
 *
 * The query stays in the `queryKeys.search.*` tree so the `db-updated`
 * listener invalidates it whenever data the search depends on changes.
 */
export function useSearchAll(
  query: string,
  options: UseSearchAllOptions = {}
): UseQueryResult<SearchAllResult, Error> {
  const debounced = useDebouncedValue(query.trim(), options.debounceMs ?? DEFAULT_DEBOUNCE_MS)
  const limit = options.limit ?? DEFAULT_LIMIT

  return useQuery({
    queryKey: queryKeys.search.query(debounced, limit),
    queryFn: () => window.api.searchAll(debounced, limit),
    enabled: debounced.length > 0,
    staleTime: 5_000
  })
}

interface UseSearchTranscriptsOptions {
  /** Debounce window before firing the IPC call. Defaults to 200ms. */
  debounceMs?: number
  /** Page size. */
  limit?: number
  /** Pagination offset (rows). */
  offset?: number
}

/**
 * Reactive transcript-FTS hook. Same debounce + short-circuit semantics as
 * `useSearchAll`. Hits include a snippet with `<<<term>>>` markers; consumers
 * format them via {@link renderSnippet}.
 */
export function useSearchTranscripts(
  query: string,
  options: UseSearchTranscriptsOptions = {}
): UseQueryResult<TranscriptSearchResult, Error> {
  const debounced = useDebouncedValue(query.trim(), options.debounceMs ?? DEFAULT_DEBOUNCE_MS)
  const limit = options.limit ?? DEFAULT_LIMIT
  const offset = options.offset ?? 0

  return useQuery({
    queryKey: queryKeys.search.transcripts(debounced, limit, offset),
    queryFn: () => window.api.searchTranscripts({ query: debounced, limit, offset }),
    enabled: debounced.length > 0,
    staleTime: 5_000
  })
}
