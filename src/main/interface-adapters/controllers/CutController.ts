import type { ICutRepository } from '@domain/repositories'
import { createTypedHandler } from './create-typed-handler'
import { toCutDto, mapPaginated } from './dto-mappers'

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
    return mapPaginated(cutRepo.findPaginated(params), toCutDto)
  })

  createTypedHandler('get-cut-by-id', async (_event, id) => {
    const cut = cutRepo.findById(id)
    return cut ? toCutDto(cut) : null
  })

  createTypedHandler('get-cuts-by-tags', async (_event, tags) => {
    return cutRepo.findByTags(tags).map(toCutDto)
  })

  createTypedHandler('delete-cut', async (_event, id) => {
    cutRepo.updateStatus(id, 'deleted', new Date().toISOString())
  })

  createTypedHandler('restore-cut', async (_event, id) => {
    cutRepo.updateStatus(id, 'active', null)
  })
}
