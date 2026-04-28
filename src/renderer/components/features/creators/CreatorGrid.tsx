import { cn } from '@/lib/utils'

interface CreatorGridProps {
  children: React.ReactNode
  className?: string
}

export function CreatorGrid({ children, className }: CreatorGridProps): React.ReactElement {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
        className
      )}
    >
      {children}
    </div>
  )
}
