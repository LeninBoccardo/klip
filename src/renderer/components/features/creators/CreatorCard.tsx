import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { mediaUrl } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { CreatorDto } from '@shared/dtos'

interface CreatorCardProps {
  creator: CreatorDto
  onClick?: () => void
  className?: string
}

export function CreatorCard({ creator, onClick, className }: CreatorCardProps): React.ReactElement {
  const { t } = useTranslation('creators')
  const initials = creator.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const avatarSrc = creator.hasLocalAvatar
    ? mediaUrl('creator', creator.id, 'avatar')
    : (creator.avatarUrl ?? undefined)

  return (
    <Card
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? t('card.openAria', { name: creator.name }) : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      className={cn(
        'group cursor-pointer transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        creator.status === 'deleted' && 'opacity-60',
        className
      )}
      onClick={onClick}
    >
      <CardContent className="flex items-center gap-3 p-4">
        <Avatar className="size-10">
          <AvatarImage src={avatarSrc} alt={creator.name} loading="lazy" decoding="async" />
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
