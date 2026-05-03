import { Card, CardContent } from '@ui/card'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: string
  hint?: string
  icon?: React.ReactNode
  className?: string
}

export function StatCard({ label, value, hint, icon, className }: StatCardProps): React.ReactElement {
  return (
    <Card className={cn('h-full', className)}>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="space-y-1 min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </CardContent>
    </Card>
  )
}
