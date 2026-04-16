import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'

export function useAuditLogRecent(limit: number = 20) {
  return useQuery({
    queryKey: queryKeys.auditLog.recent(limit),
    queryFn: () => window.api.getAuditLogRecent(limit)
  })
}

export function useAuditLogByEntity(entityType: string, entityId: string) {
  return useQuery({
    queryKey: queryKeys.auditLog.byEntity(entityType, entityId),
    queryFn: () => window.api.getAuditLogByEntity(entityType, entityId),
    enabled: !!entityType && !!entityId
  })
}
