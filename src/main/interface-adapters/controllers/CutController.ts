import type { ICutRepository } from '@domain/repositories'
import { createTypedHandler } from './create-typed-handler'

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
  createTypedHandler('get-cuts-paginated', async (_event, params) => {
    return cutRepo.findPaginated(params)
  })

  createTypedHandler('get-cut-by-id', async (_event, id) => {
    return cutRepo.findById(id)
  })

  createTypedHandler('get-cuts-by-tags', async (_event, tags) => {
    return cutRepo.findByTags(tags)
  })

  createTypedHandler('delete-cut', async (_event, id) => {
    cutRepo.updateStatus(id, 'deleted', new Date().toISOString())
  })

  createTypedHandler('restore-cut', async (_event, id) => {
    cutRepo.updateStatus(id, 'active', null)
  })
}
