/** Renderer-facing representation of an operation (saga log entry) */
export interface OperationDto {
  id: string
  type: string
  status: string
  payload: string
  error: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}
