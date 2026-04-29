import { Card, CardContent } from '@ui/card'
import { Badge } from '@ui/badge'
import { ListMusic } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CollectionDto } from '@shared/dtos'

interface CollectionCardProps {
  collection: CollectionDto
  onClick?: () => void
  className?: string
}

export function CollectionCard({
  collection,
  onClick,
  className
}: CollectionCardProps): React.ReactElement {
  return (
    <Card
      className={cn('group cursor-pointer transition-colors hover:bg-accent/50', className)}
      onClick={onClick}
    >
      <CardContent className="flex items-start gap-3 p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
          <ListMusic className="size-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{collection.name}</p>
          {collection.description && (
            <p className="truncate text-xs text-muted-foreground">{collection.description}</p>
          )}
        </div>
        <Badge variant="outline" className="shrink-0 font-normal">
          {collection.itemCount} {collection.itemCount === 1 ? 'item' : 'items'}
        </Badge>
      </CardContent>
    </Card>
  )
}
