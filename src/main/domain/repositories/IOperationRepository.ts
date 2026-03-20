import type { Operation, OperationStatus } from '@domain/entities'

export interface IOperationRepository {
  create(operation: Operation): void
  findById(id: string): Operation | null
  findByStatus(status: OperationStatus): Operation[]
  updateStatus(id: string, status: OperationStatus, error?: string | null): void
  updatePayload(id: string, payload: string): void
}
