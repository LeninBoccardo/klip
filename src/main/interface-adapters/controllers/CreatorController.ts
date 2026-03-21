import type { ICreatorRepository } from '@domain/repositories'
import { createTypedHandler } from './create-typed-handler'

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
  createTypedHandler('get-creators-paginated', async (_event, params) => {
    return creatorRepo.findPaginated(params)
  })

  createTypedHandler('get-creator-by-id', async (_event, id) => {
    return creatorRepo.findById(id)
  })

  createTypedHandler('delete-creator', async (_event, id) => {
    creatorRepo.updateStatus(id, 'deleted', new Date().toISOString())
  })

  createTypedHandler('restore-creator', async (_event, id) => {
    creatorRepo.updateStatus(id, 'active', null)
  })
}
