import type { IVideoRepository } from '@domain/repositories'
import type { IFileSystemReader } from '@domain/ports'
import type { IFetchVideoDetail } from '@use-cases/IFetchVideoDetail'
import type { IEnrichAllVideos } from '@use-cases/IEnrichAllVideos'
import type { IFetchVideoComments } from '@use-cases/IFetchVideoComments'
import { parseVtt } from '@domain/types'
import { createTypedHandler } from './create-typed-handler'

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
 *   - `fetch-video-comments`  → fetch comments + replies on demand (no DB writes)
 */
export function registerVideoController(
  videoRepo: IVideoRepository,
  fetchVideoDetail: IFetchVideoDetail,
  enrichAllVideos: IEnrichAllVideos,
  fetchVideoComments: IFetchVideoComments,
  fsReader: IFileSystemReader
): void {
  createTypedHandler('get-videos-paginated', async (_event, params) => {
    return videoRepo.findPaginated(params)
  })

  createTypedHandler('get-video-by-id', async (_event, id) => {
    return videoRepo.findById(id)
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

  createTypedHandler('fetch-video-comments', async (_event, videoId, maxComments) => {
    return fetchVideoComments.execute(videoId, maxComments)
  })
}
