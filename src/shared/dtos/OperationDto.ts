/**
 * Renderer-facing representation of an operation (saga log entry).
 *
 * `payload` is intentionally OMITTED: the domain Operation.payload embeds
 * serialized absolute filesystem paths (e.g. migrate_root's old/new roots), and
 * DTOs must not leak raw paths across the IPC boundary (see dto-mappers header).
 * The renderer only needs status/timestamps/error for an operations view. (F63)
 */
export interface OperationDto {
  id: string
  type: string
  status: string
  error: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}
