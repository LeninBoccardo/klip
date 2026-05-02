import type { ICreatorRepository } from '@domain/repositories'
import type { IRegisterCreator } from '@use-cases/IRegisterCreator'
import { createTypedHandler } from './create-typed-handler'
import { toCreatorDto, mapPaginated } from './dto-mappers'

/**
 * IPC controller for creator CRUD operations.
 *
 * Registers:
 *   - `get-creators-paginated` → paginated list of creators
 *   - `get-creator-by-id`      → single creator lookup
 *   - `delete-creator`         → soft-delete (status → 'deleted')
 *   - `restore-creator`        → restore (status → 'active')
 *   - `register-creator`       → create from a fetched ChannelInfo + overrides
 */
export function registerCreatorController(
  creatorRepo: ICreatorRepository,
  registerCreator: IRegisterCreator
): void {
  createTypedHandler('get-creators-paginated', async (_event, params) => {
    return mapPaginated(creatorRepo.findPaginated(params), toCreatorDto)
  })

  createTypedHandler('get-creator-by-id', async (_event, id) => {
    const creator = creatorRepo.findById(id)
    return creator ? toCreatorDto(creator) : null
  })

  createTypedHandler('delete-creator', async (_event, id) => {
    creatorRepo.updateStatus(id, 'deleted', new Date().toISOString())
  })

  createTypedHandler('restore-creator', async (_event, id) => {
    creatorRepo.updateStatus(id, 'active', null)
  })

  createTypedHandler('register-creator', async (_event, request) => {
    return registerCreator.execute(request)
  })
}
