import type { IVideoRepository } from '@domain/repositories'
import type { IFileSystemReader } from '@domain/ports'
import type { IFetchVideoDetail } from '@use-cases/IFetchVideoDetail'
import type { IEnrichAllVideos } from '@use-cases/IEnrichAllVideos'
import type { IFetchVideoComments } from '@use-cases/IFetchVideoComments'
import type { IGetCachedVideoComments } from '@use-cases/GetCachedVideoComments'
import type { IMoveVideosToCreator } from '@use-cases/IMoveVideosToCreator'
import { parseVtt, parseVttSegments } from '@domain/types'
import { createTypedHandler } from './create-typed-handler'
import { toVideoDto, mapPaginated } from './dto-mappers'

/**
 * IPC controller for video CRUD + detail/transcript operations.
 *
 * Registers:
 *   - `get-videos-paginated`  → paginated list of videos
 *   - `get-video-by-id`       → single video lookup
 *   - `delete-video`          → soft-delete (status → 'deleted')
 *   - `restore-video`         → restore (status → 'active')
 *   - `fetch-video-detail`    → fetch + persist extended metadata + transcript
 *   - `enrich-all-videos`     → batch enrich active videos with no detail yet
 *   - `get-transcript`        → read parsed transcript text from disk
 *   - `get-transcript-segments` → read timed transcript segments (for the
 *                                  player-clickable transcript view)
 *   - `fetch-video-comments`  → fetch comments + replies on demand (writes to cache)
 *   - `get-cached-video-comments` → read cached comments (no network)
 */
export function registerVideoController(
  videoRepo: IVideoRepository,
  fetchVideoDetail: IFetchVideoDetail,
  enrichAllVideos: IEnrichAllVideos,
  fetchVideoComments: IFetchVideoComments,
  getCachedVideoComments: IGetCachedVideoComments,
  fsReader: IFileSystemReader,
  moveVideosToCreator: IMoveVideosToCreator
): void {
  createTypedHandler('get-videos-paginated', async (_event, params) => {
    return mapPaginated(videoRepo.findPaginated(params), toVideoDto)
  })

  createTypedHandler('get-video-by-id', async (_event, id) => {
    const video = videoRepo.findById(id)
    return video ? toVideoDto(video) : null
  })

  createTypedHandler('delete-video', async (_event, id) => {
    videoRepo.updateStatus(id, 'deleted', new Date().toISOString())
  })

  createTypedHandler('restore-video', async (_event, id) => {
    videoRepo.updateStatus(id, 'active', null)
  })

  createTypedHandler('fetch-video-detail', async (_event, videoId) => {
    return fetchVideoDetail.execute(videoId)
  })

  createTypedHandler('enrich-all-videos', async () => {
    return enrichAllVideos.execute()
  })

  createTypedHandler('get-transcript', async (_event, videoId) => {
    const video = videoRepo.findById(videoId)
    if (!video || !video.transcriptPath) return null
    const raw = fsReader.readTextFile(video.transcriptPath)
    return raw ? parseVtt(raw) : null
  })

  createTypedHandler('get-transcript-segments', async (_event, videoId) => {
    const video = videoRepo.findById(videoId)
    if (!video || !video.transcriptPath) return null
    const raw = fsReader.readTextFile(video.transcriptPath)
    return raw ? parseVttSegments(raw) : null
  })

  createTypedHandler('fetch-video-comments', async (_event, videoId, maxComments) => {
    return fetchVideoComments.execute(videoId, maxComments)
  })

  createTypedHandler('get-cached-video-comments', async (_event, videoId) => {
    return getCachedVideoComments.execute(videoId)
  })

  createTypedHandler('move-videos-to-creator', async (_event, request) => {
    return moveVideosToCreator.execute(request)
  })
}
