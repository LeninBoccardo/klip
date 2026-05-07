import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { formatDistanceToNow } from 'date-fns'
import { useDateLocale } from '@renderer/i18n/date-locale'
import { Users, Film, Scissors, ListMusic, Activity } from 'lucide-react'
import {
  classifyAction,
  classifyEntity,
  entityHref,
  type AuditEntityKind
} from '@/lib/audit-format'
import type { AuditEntryDto } from '@shared/dtos'

const ICON_BY_KIND: Record<AuditEntityKind, React.ComponentType<{ className?: string }>> = {
  creator: Users,
  video: Film,
  cut: Scissors,
  collection: ListMusic,
  unknown: Activity
}

export function AuditEntryRow({ entry }: { entry: AuditEntryDto }): React.ReactElement {
  const { t } = useTranslation('activity')
  const dateLocale = useDateLocale()
  const kind = classifyEntity(entry.entityType)
  const action = classifyAction(entry.action)
  const Icon = ICON_BY_KIND[kind]
  const href = entityHref(entry)

  const idLabel = (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{entry.entityId}</code>
  )

  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card px-3 py-2">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-medium">{t(`action.${action}` as const)}</span>
          <span className="text-xs text-muted-foreground">{t(`entity.${kind}` as const)}</span>
          {href ? (
            <Link to={href} className="hover:underline">
              {idLabel}
            </Link>
          ) : (
            idLabel
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(entry.createdAt), {
            addSuffix: true,
            locale: dateLocale
          })}
        </p>
      </div>
    </div>
  )
}
