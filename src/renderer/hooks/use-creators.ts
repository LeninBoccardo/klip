import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import type { PaginationParams } from '@shared/types'

export function useCreatorsPaginated(params: PaginationParams) {
  return useQuery({
    queryKey: queryKeys.creators.list(params),
    queryFn: () => window.api.getCreatorsPaginated(params)
  })
}

export function useCreatorById(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.creators.detail(id!),
    queryFn: () => window.api.getCreatorById(id!),
    enabled: !!id
  })
}

export function useDeleteCreator() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.deleteCreator(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.creators.all })
  })
}

export function useRestoreCreator() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.restoreCreator(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.creators.all })
  })
}
