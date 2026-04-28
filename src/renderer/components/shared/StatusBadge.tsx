import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { EntityStatus } from '@shared/types'

const statusConfig: Record<
  EntityStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  active: { label: 'Active', variant: 'default' },
  deleted: { label: 'Deleted', variant: 'destructive' },
  missing: { label: 'Missing', variant: 'outline' }
}

interface StatusBadgeProps {
  status: EntityStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps): React.ReactElement {
  const config = statusConfig[status]
  return (
    <Badge variant={config.variant} className={cn('text-xs', className)}>
      {config.label}
    </Badge>
  )
}
