import { cn } from '@/lib/utils'

interface MediaGridProps {
  children: React.ReactNode
  className?: string
}

export function MediaGrid({ children, className }: MediaGridProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
        className
      )}
    >
      {children}
    </div>
  )
}
