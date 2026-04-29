import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult
} from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import type { CollectionDto, CollectionItemDto } from '@shared/dtos'
import type {
  AddToCollectionRequest,
  AddToCollectionResult,
  CreateCollectionRequest,
  PaginatedResult,
  PaginationParams,
  RemoveFromCollectionRequest,
  RenameCollectionRequest,
  ReorderCollectionRequest
} from '@shared/types'

export function useCollectionsPaginated(
  params: PaginationParams
): UseQueryResult<PaginatedResult<CollectionDto>, Error> {
  return useQuery({
    queryKey: queryKeys.collections.list(params),
    queryFn: () => window.api.getCollectionsPaginated(params)
  })
}

export function useCollection(id: string): UseQueryResult<CollectionDto | null, Error> {
  return useQuery({
    queryKey: queryKeys.collections.detail(id),
    queryFn: () => window.api.getCollectionById(id),
    enabled: !!id
  })
}

export function useCollectionItems(id: string): UseQueryResult<CollectionItemDto[], Error> {
  return useQuery({
    queryKey: queryKeys.collections.items(id),
    queryFn: () => window.api.getCollectionItems(id),
    enabled: !!id
  })
}

/**
 * Each mutation invalidates the entire `collections` tree locally so the UI
 * reflects the change immediately, in addition to the server-side
 * `db-updated` push that re-invalidates after roundtrip. The double-fire is
 * harmless (TanStack Query coalesces) and avoids the "click-then-wait" feel.
 */
export function useCreateCollection(): UseMutationResult<
  CollectionDto,
  Error,
  CreateCollectionRequest
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (request: CreateCollectionRequest) => window.api.createCollection(request),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.collections.all })
  })
}

export function useRenameCollection(): UseMutationResult<
  CollectionDto,
  Error,
  RenameCollectionRequest
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (request: RenameCollectionRequest) => window.api.renameCollection(request),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.collections.all })
  })
}

export function useDeleteCollection(): UseMutationResult<{ deleted: boolean }, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.deleteCollection(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.collections.all })
  })
}

export function useAddToCollection(): UseMutationResult<
  AddToCollectionResult,
  Error,
  AddToCollectionRequest
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (request: AddToCollectionRequest) => window.api.addToCollection(request),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.collections.all })
  })
}

export function useRemoveFromCollection(): UseMutationResult<
  { removed: boolean },
  Error,
  RemoveFromCollectionRequest
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (request: RemoveFromCollectionRequest) => window.api.removeFromCollection(request),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.collections.all })
  })
}

export function useReorderCollection(): UseMutationResult<
  { reordered: number },
  Error,
  ReorderCollectionRequest
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (request: ReorderCollectionRequest) => window.api.reorderCollection(request),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.collections.all })
  })
}
