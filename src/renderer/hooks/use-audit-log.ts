import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import type { AuditEntryDto } from '@shared/dtos'

export function useAuditLogRecent(limit: number = 20): UseQueryResult<AuditEntryDto[], Error> {
  return useQuery({
    queryKey: queryKeys.auditLog.recent(limit),
    queryFn: () => window.api.getAuditLogRecent(limit)
  })
}

export function useAuditLogByEntity(
  entityType: string,
  entityId: string
): UseQueryResult<AuditEntryDto[], Error> {
  return useQuery({
    queryKey: queryKeys.auditLog.byEntity(entityType, entityId),
    queryFn: () => window.api.getAuditLogByEntity(entityType, entityId),
    enabled: !!entityType && !!entityId
  })
}
