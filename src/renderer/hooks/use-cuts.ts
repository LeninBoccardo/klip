import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import type { CutQueryParams } from '@shared/types'

export function useCutsPaginated(params: CutQueryParams) {
  return useQuery({
    queryKey: queryKeys.cuts.list(params),
    queryFn: () => window.api.getCutsPaginated(params)
  })
}

export function useCutById(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.cuts.detail(id!),
    queryFn: () => window.api.getCutById(id!),
    enabled: !!id
  })
}

export function useCutsByTags(tags: string[]) {
  return useQuery({
    queryKey: queryKeys.cuts.byTags(tags),
    queryFn: () => window.api.getCutsByTags(tags),
    enabled: tags.length > 0
  })
}

export function useDeleteCut() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.deleteCut(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.cuts.all })
  })
}

export function useRestoreCut() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.restoreCut(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.cuts.all })
  })
}
