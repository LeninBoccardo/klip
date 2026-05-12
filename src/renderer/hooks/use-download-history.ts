import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult
} from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import type { DownloadHistoryEntryDto } from '@shared/dtos'

/**
 * Read the most recent finished-download entries. The page typically asks
 * for 50 — small enough to scan, large enough that retries appear without
 * scrolling. Bumped by callers if/when a "Load more" appears in the UI.
 */
export function useDownloadHistory(
  limit = 50
): UseQueryResult<DownloadHistoryEntryDto[], Error> {
  return useQuery({
    queryKey: queryKeys.downloadHistory.recent(limit),
    queryFn: () => window.api.listDownloadHistory(limit)
  })
}

/**
 * Retry a failed history entry. On success, invalidates the history list
 * so the brand-new attempt row (which `DownloadVideo` itself appended)
 * shows up without a manual refresh.
 */
export function useRetryDownload(): UseMutationResult<
  { downloadId: string },
  Error,
  string
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (historyId: string) => window.api.retryDownload(historyId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.downloadHistory.all })
    }
  })
}
