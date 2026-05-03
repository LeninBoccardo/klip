import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Item,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions
} from '@/components/ui/item'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { HistoryButton } from '@/components/features/activity/HistoryButton'
import { mediaUrl } from '@/lib/format'
import type { CreatorDto } from '@shared/dtos'

interface CreatorHeaderProps {
  creator: CreatorDto
}

export function CreatorHeader({ creator }: CreatorHeaderProps): React.ReactElement {
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
    <Item size="sm">
      <ItemMedia>
        <Avatar className="size-14">
          <AvatarImage src={avatarSrc} alt={creator.name} />
          <AvatarFallback className="text-lg">{initials}</AvatarFallback>
        </Avatar>
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          <span className="text-2xl font-bold tracking-tight">{creator.name}</span>
          <StatusBadge status={creator.status} />
        </ItemTitle>
        <ItemDescription>{creator.folderName}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <HistoryButton entityType="creator" entityId={creator.id} entityName={creator.name} />
      </ItemActions>
    </Item>
  )
}
