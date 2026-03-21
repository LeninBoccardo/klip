import type { IVideoRepository } from '@domain/repositories'
import { createTypedHandler } from './create-typed-handler'

/**
 * IPC controller for video CRUD operations.
 *
 * Registers:
 *   - `get-videos-paginated` → paginated list of videos
 *   - `get-video-by-id`      → single video lookup
 *   - `delete-video`         → soft-delete (status → 'deleted')
 *   - `restore-video`        → restore (status → 'active')
 */
export function registerVideoController(videoRepo: IVideoRepository): void {
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
}
