import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { toMediaSrc } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { CreatorDto } from '@shared/dtos'

interface CreatorCardProps {
  creator: CreatorDto
  onClick?: () => void
  className?: string
}

export function CreatorCard({ creator, onClick, className }: CreatorCardProps) {
  const initials = creator.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <Card
      className={cn(
        'group cursor-pointer transition-colors hover:bg-accent/50',
        creator.status === 'deleted' && 'opacity-60',
        className
      )}
      onClick={onClick}
    >
      <CardContent className="flex items-center gap-3 p-4">
        <Avatar className="size-10">
          <AvatarImage src={toMediaSrc(creator.profileImagePath)} alt={creator.name} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{creator.name}</p>
          <p className="truncate text-xs text-muted-foreground">{creator.folderName}</p>
        </div>
        <StatusBadge status={creator.status} />
      </CardContent>
    </Card>
  )
}
