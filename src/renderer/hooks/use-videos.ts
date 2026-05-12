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
  MoveVideosToCreatorResult,
  TranscriptSegment
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
      qc.invalidateQueries({ queryKey: queryKeys.videos.transcriptSegments(videoId) })
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

export function useTranscriptSegments(
  videoId: string | undefined
): UseQueryResult<TranscriptSegment[] | null, Error> {
  return useQuery({
    queryKey: queryKeys.videos.transcriptSegments(videoId!),
    queryFn: () => window.api.getTranscriptSegments(videoId!),
    enabled: !!videoId
  })
}

export function useFetchVideoComments(): UseMutationResult<
  VideoCommentsResult,
  Error,
  { videoId: string; maxComments?: number }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ videoId, maxComments = 500 }: { videoId: string; maxComments?: number }) =>
      window.api.fetchVideoComments(videoId, maxComments),
    onSuccess: (data, { videoId }) => {
      // Seed the cached-comments query so a tab toggle or remount picks
      // up the fresh data without an extra round trip to main.
      qc.setQueryData(queryKeys.videos.commentsCache(videoId), data)
    }
  })
}

/**
 * Reads the on-disk cached comments for a video (7-day TTL, written by
 * `useFetchVideoComments`). Resolves to null on cache miss. Auto-fires
 * on mount so the Comments tab can show prior data instantly without
 * the user re-clicking "Load comments" after every tab switch.
 *
 * Does NOT hit yt-dlp — that's `useFetchVideoComments`'s job. Renderer
 * code shows the Load button when this query returns null.
 */
export function useCachedVideoComments(
  videoId: string | undefined
): UseQueryResult<VideoCommentsResult | null, Error> {
  return useQuery({
    queryKey: queryKeys.videos.commentsCache(videoId!),
    queryFn: () => window.api.getCachedVideoComments(videoId!),
    enabled: !!videoId,
    // The cache file itself is the source of truth; don't refetch the
    // disk read for staleness — the only thing that changes the cached
    // payload is a successful `useFetchVideoComments`, which seeds this
    // query directly via `setQueryData` on success.
    staleTime: Infinity,
    gcTime: Infinity
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
