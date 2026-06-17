import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult
} from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import type {
  PaginationParams,
  PaginatedResult,
  FetchChannelInfoResult,
  RegisterCreatorRequest,
  RegisterCreatorResult
} from '@shared/types'
import type { CreatorDto } from '@shared/dtos'

export function useCreatorsPaginated(
  params: PaginationParams
): UseQueryResult<PaginatedResult<CreatorDto>, Error> {
  return useQuery({
    queryKey: queryKeys.creators.list(params),
    queryFn: () => window.api.getCreatorsPaginated(params)
  })
}

export function useCreatorById(id: string | undefined): UseQueryResult<CreatorDto | null, Error> {
  return useQuery({
    queryKey: queryKeys.creators.detail(id!),
    queryFn: () => window.api.getCreatorById(id!),
    enabled: !!id
  })
}

// See use-videos.ts invalidateVideoTrees — soft delete/restore emits no
// db-updated push, so mirror the db-listener's 'creators' scope (search + stats
// also reflect creator status). (F28)
function invalidateCreatorTrees(qc: ReturnType<typeof useQueryClient>): void {
  qc.invalidateQueries({ queryKey: queryKeys.creators.all })
  qc.invalidateQueries({ queryKey: queryKeys.search.all })
  qc.invalidateQueries({ queryKey: queryKeys.stats.all })
}

export function useDeleteCreator(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.deleteCreator(id),
    onSuccess: () => invalidateCreatorTrees(qc)
  })
}

export function useRestoreCreator(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.restoreCreator(id),
    onSuccess: () => invalidateCreatorTrees(qc)
  })
}

export function useFetchChannelInfo(): UseMutationResult<FetchChannelInfoResult, Error, string> {
  return useMutation({
    mutationFn: (url: string) => window.api.fetchChannelInfo(url)
  })
}

export function useRegisterCreator(): UseMutationResult<
  RegisterCreatorResult,
  Error,
  RegisterCreatorRequest
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (request: RegisterCreatorRequest) => window.api.registerCreator(request),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.creators.all })
  })
}
