import type { IOperationRepository } from '@domain/repositories'
import type { OperationStatus } from '@domain/entities'
import { createTypedHandler } from './create-typed-handler'

/**
 * IPC controller for operation history read operations.
 *
 * Registers:
 *   - `get-operation-by-id`      → single operation lookup
 *   - `get-operations-by-status` → operations filtered by status
 */
export function registerOperationController(operationRepo: IOperationRepository): void {
  createTypedHandler('get-operation-by-id', async (_event, id) => {
    return operationRepo.findById(id)
  })

  createTypedHandler('get-operations-by-status', async (_event, status) => {
    return operationRepo.findByStatus(status as OperationStatus)
  })
}
