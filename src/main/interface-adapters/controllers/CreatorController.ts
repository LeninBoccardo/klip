import { ipcMain } from 'electron'
import type { ICreatorRepository } from '@domain/repositories'
import type { PaginationParams, PaginatedResult } from '@shared/types'
import type { CreatorDto } from '@shared/dtos'
import { IpcChannels } from '@shared/ipc-channels'

/**
 * IPC controller for creator CRUD operations.
 *
 * Registers:
 *   - `get-creators-paginated` → paginated list of creators
 *   - `get-creator-by-id`      → single creator lookup
 *   - `delete-creator`         → soft-delete (status → 'deleted')
 *   - `restore-creator`        → restore (status → 'active')
 */
export function registerCreatorController(creatorRepo: ICreatorRepository): void {
  ipcMain.handle(
    IpcChannels.GetCreatorsPaginated,
    async (_event, params: PaginationParams): Promise<PaginatedResult<CreatorDto>> => {
      return creatorRepo.findPaginated(params)
    }
  )

  ipcMain.handle(
    IpcChannels.GetCreatorById,
    async (_event, id: string): Promise<CreatorDto | null> => {
      return creatorRepo.findById(id)
    }
  )

  ipcMain.handle(IpcChannels.DeleteCreator, async (_event, id: string): Promise<void> => {
    creatorRepo.updateStatus(id, 'deleted', new Date().toISOString())
  })

  ipcMain.handle(IpcChannels.RestoreCreator, async (_event, id: string): Promise<void> => {
    creatorRepo.updateStatus(id, 'active', null)
  })
}
