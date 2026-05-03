import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult
} from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import type {
  VideoQueryParams,
  PaginatedResult,
  VideoDetailWithTranscript,
  EnrichVideosResult,
  VideoCommentsResult,
  MoveVideosToCreatorRequest,
  MoveVideosToCreatorResult
} from '@shared/types'
import type { VideoDto } from '@shared/dtos'

export function useVideosPaginated(
  params: VideoQueryParams
): UseQueryResult<PaginatedResult<VideoDto>, Error> {
  return useQuery({
    queryKey: queryKeys.videos.list(params),
    queryFn: () => window.api.getVideosPaginated(params)
  })
}

export function useVideoById(id: string | undefined): UseQueryResult<VideoDto | null, Error> {
  return useQuery({
    queryKey: queryKeys.videos.detail(id!),
    queryFn: () => window.api.getVideoById(id!),
    enabled: !!id
  })
}

export function useDeleteVideo(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.deleteVideo(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.videos.all })
  })
}

export function useRestoreVideo(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.restoreVideo(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.videos.all })
  })
}

export function useFetchVideoDetail(): UseMutationResult<VideoDetailWithTranscript, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (videoId: string) => window.api.fetchVideoDetail(videoId),
    onSuccess: (_, videoId) => {
      qc.invalidateQueries({ queryKey: queryKeys.videos.detail(videoId) })
      qc.invalidateQueries({ queryKey: queryKeys.videos.transcript(videoId) })
    }
  })
}

export function useEnrichAllVideos(): UseMutationResult<EnrichVideosResult, Error, void> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => window.api.enrichAllVideos(),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.videos.all })
  })
}

export function useTranscript(videoId: string | undefined): UseQueryResult<string | null, Error> {
  return useQuery({
    queryKey: queryKeys.videos.transcript(videoId!),
    queryFn: () => window.api.getTranscript(videoId!),
    enabled: !!videoId
  })
}

export function useFetchVideoComments(): UseMutationResult<
  VideoCommentsResult,
  Error,
  { videoId: string; maxComments?: number }
> {
  return useMutation({
    mutationFn: ({ videoId, maxComments = 500 }: { videoId: string; maxComments?: number }) =>
      window.api.fetchVideoComments(videoId, maxComments)
  })
}

export function useMoveVideosToCreator(): UseMutationResult<
  MoveVideosToCreatorResult,
  Error,
  MoveVideosToCreatorRequest
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (request: MoveVideosToCreatorRequest) => window.api.moveVideosToCreator(request),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.videos.all })
      qc.invalidateQueries({ queryKey: queryKeys.creators.all })
    }
  })
}
