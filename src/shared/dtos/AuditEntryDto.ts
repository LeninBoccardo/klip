/** Renderer-facing representation of an audit log entry */
export interface AuditEntryDto {
  id: number
  entityType: string
  entityId: string
  action: string
  changes: string | null
  createdAt: string
}
