import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description?: string
  /** Action slot rendered on the right side (e.g. a Button) */
  actions?: React.ReactNode
  className?: string
}

/**
 * Consistent page header with title, optional description, and action slot.
 * Uses the same typography tokens across all pages.
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
