import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import type { VideoQueryParams } from '@shared/types'

export function useVideosPaginated(params: VideoQueryParams) {
  return useQuery({
    queryKey: queryKeys.videos.list(params),
    queryFn: () => window.api.getVideosPaginated(params)
  })
}

export function useVideoById(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.videos.detail(id!),
    queryFn: () => window.api.getVideoById(id!),
    enabled: !!id
  })
}

export function useDeleteVideo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.deleteVideo(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.videos.all })
  })
}

export function useRestoreVideo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.restoreVideo(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.videos.all })
  })
}
