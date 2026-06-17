import type { IOperationRepository } from '@domain/repositories'
import type { OperationStatus } from '@domain/entities'
import { createTypedHandler } from './create-typed-handler'
import { toOperationDto } from './dto-mappers'

/**
 * IPC controller for operation history read operations.
 *
 * Registers:
 *   - `get-operation-by-id`      → single operation lookup
 *   - `get-operations-by-status` → operations filtered by status
 *
 * Results are mapped through toOperationDto, which strips the path-bearing
 * `payload` (F63). The `status as OperationStatus` cast below is now SOUND: the
 * ipc-schema validates it against the 5-member status enum before it reaches
 * here (the contract types it `string` only because @shared can't import the
 * domain union). (F65)
 */
export function registerOperationController(operationRepo: IOperationRepository): void {
  createTypedHandler('get-operation-by-id', async (_event, id) => {
    const op = operationRepo.findById(id)
    return op ? toOperationDto(op) : null
  })

  createTypedHandler('get-operations-by-status', async (_event, status) => {
    return operationRepo.findByStatus(status as OperationStatus).map(toOperationDto)
  })
}
