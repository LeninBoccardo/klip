import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { EntityStatus } from '@shared/types'

const variantByStatus: Record<EntityStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  deleted: 'destructive',
  missing: 'outline'
}

interface StatusBadgeProps {
  status: EntityStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps): React.ReactElement {
  const { t } = useTranslation('creators')
  return (
    <Badge variant={variantByStatus[status]} className={cn('text-xs', className)}>
      {t(`status.${status}`)}
    </Badge>
  )
}
