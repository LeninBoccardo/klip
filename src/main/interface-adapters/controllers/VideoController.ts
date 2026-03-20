import { ipcMain } from 'electron'
import type { IVideoRepository } from '@domain/repositories'
import type { VideoQueryParams, PaginatedResult } from '@shared/types'
import type { VideoDto } from '@shared/dtos'
import { IpcChannels } from '@shared/ipc-channels'

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
  ipcMain.handle(
    IpcChannels.GetVideosPaginated,
    async (_event, params: VideoQueryParams): Promise<PaginatedResult<VideoDto>> => {
      return videoRepo.findPaginated(params)
    }
  )

  ipcMain.handle(IpcChannels.GetVideoById, async (_event, id: string): Promise<VideoDto | null> => {
    return videoRepo.findById(id)
  })

  ipcMain.handle(IpcChannels.DeleteVideo, async (_event, id: string): Promise<void> => {
    videoRepo.updateStatus(id, 'deleted', new Date().toISOString())
  })

  ipcMain.handle(IpcChannels.RestoreVideo, async (_event, id: string): Promise<void> => {
    videoRepo.updateStatus(id, 'active', null)
  })
}
