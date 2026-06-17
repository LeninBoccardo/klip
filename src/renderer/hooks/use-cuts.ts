import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult
} from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import type { CutQueryParams, PaginatedResult } from '@shared/types'
import type { CutDto } from '@shared/dtos'

export function useCutsPaginated(
  params: CutQueryParams
): UseQueryResult<PaginatedResult<CutDto>, Error> {
  return useQuery({
    queryKey: queryKeys.cuts.list(params),
    queryFn: () => window.api.getCutsPaginated(params)
  })
}

// See use-videos.ts invalidateVideoTrees — soft delete/restore emits no
// db-updated push, so mirror the db-listener's 'cuts' scope here. (F28)
function invalidateCutTrees(qc: ReturnType<typeof useQueryClient>): void {
  qc.invalidateQueries({ queryKey: queryKeys.cuts.all })
  qc.invalidateQueries({ queryKey: queryKeys.collections.all })
  qc.invalidateQueries({ queryKey: queryKeys.search.all })
  qc.invalidateQueries({ queryKey: queryKeys.tags.all })
  qc.invalidateQueries({ queryKey: queryKeys.stats.all })
}

export function useDeleteCut(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.deleteCut(id),
    onSuccess: () => invalidateCutTrees(qc)
  })
}

export function useRestoreCut(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.restoreCut(id),
    onSuccess: () => invalidateCutTrees(qc)
  })
}
