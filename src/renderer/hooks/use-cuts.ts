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

export function useDeleteCut(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.deleteCut(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.cuts.all })
  })
}

export function useRestoreCut(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.restoreCut(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.cuts.all })
  })
}
