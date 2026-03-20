import { ipcMain } from 'electron'
import type { ICutRepository } from '@domain/repositories'
import type { CutQueryParams, PaginatedResult } from '@shared/types'
import type { CutDto } from '@shared/dtos'
import { IpcChannels } from '@shared/ipc-channels'

/**
 * IPC controller for cut CRUD operations.
 *
 * Registers:
 *   - `get-cuts-paginated` → paginated list of cuts
 *   - `get-cut-by-id`      → single cut lookup
 *   - `get-cuts-by-tags`   → find cuts matching any of the given tags
 *   - `delete-cut`         → soft-delete (status → 'deleted')
 *   - `restore-cut`        → restore (status → 'active')
 */
export function registerCutController(cutRepo: ICutRepository): void {
  ipcMain.handle(
    IpcChannels.GetCutsPaginated,
    async (_event, params: CutQueryParams): Promise<PaginatedResult<CutDto>> => {
      return cutRepo.findPaginated(params)
    }
  )

  ipcMain.handle(IpcChannels.GetCutById, async (_event, id: string): Promise<CutDto | null> => {
    return cutRepo.findById(id)
  })

  ipcMain.handle(IpcChannels.GetCutsByTags, async (_event, tags: string[]): Promise<CutDto[]> => {
    return cutRepo.findByTags(tags)
  })

  ipcMain.handle(IpcChannels.DeleteCut, async (_event, id: string): Promise<void> => {
    cutRepo.updateStatus(id, 'deleted', new Date().toISOString())
  })

  ipcMain.handle(IpcChannels.RestoreCut, async (_event, id: string): Promise<void> => {
    cutRepo.updateStatus(id, 'active', null)
  })
}
