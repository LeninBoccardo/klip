import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult
} from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import type {
  TagAggregation,
  BulkUpdateTagsRequest,
  BulkUpdateTagsResult,
  RenameTagGloballyResult
} from '@shared/types'

/**
 * Distinct tags across active videos and cuts, with per-table counts.
 * Drives the TagInput autocomplete and any future tag-management page.
 *
 * The query stays in the `queryKeys.tags.*` tree so it's invalidated by the
 * `db-updated` listener whenever a videos- or cuts-scoped push fires (the
 * targeted invalidation refactor in S13 covers this — see use-db-listener).
 */
export function useAllDistinctTags(): UseQueryResult<TagAggregation[], Error> {
  return useQuery({
    queryKey: queryKeys.tags.distinct,
    queryFn: () => window.api.getAllDistinctTags()
  })
}

/**
 * Bulk add/remove tags across many entities. Fires `db-updated` exactly once
 * at the end so the query cache invalidates a single time regardless of
 * batch size.
 */
export function useBulkUpdateTags(): UseMutationResult<
  BulkUpdateTagsResult,
  Error,
  BulkUpdateTagsRequest
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (request: BulkUpdateTagsRequest) => window.api.bulkUpdateTags(request),
    onSuccess: (_result, request) => {
      // Optimistic local invalidation in addition to the server-side
      // `db-updated` push — fires immediately so the UI reflects the
      // batch before the push roundtrips back.
      qc.invalidateQueries({ queryKey: queryKeys.tags.all })
      if (request.entityKind === 'video') {
        qc.invalidateQueries({ queryKey: queryKeys.videos.all })
      } else {
        qc.invalidateQueries({ queryKey: queryKeys.cuts.all })
      }
    }
  })
}

/** Rewrite a tag everywhere it appears across videos and cuts. */
export function useRenameTagGlobally(): UseMutationResult<
  RenameTagGloballyResult,
  Error,
  { oldTag: string; newTag: string }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ oldTag, newTag }) => window.api.renameTagGlobally(oldTag, newTag),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tags.all })
      qc.invalidateQueries({ queryKey: queryKeys.videos.all })
      qc.invalidateQueries({ queryKey: queryKeys.cuts.all })
    }
  })
}
