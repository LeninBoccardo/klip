import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
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
  const queryClient = useQueryClient()
  const needsAvatar = !creator.hasLocalAvatar && creator.avatarUrl === null

  // Silent background refresh: if this creator has no local avatar and no
  // remote URL, try re-asking yt-dlp once on page entry. The main-process
  // use-case is idempotent (skips when an avatar is already present) and
  // never throws — failures here are completely invisible to the user.
  useEffect(() => {
    if (!needsAvatar) return
    void window.api
      .refreshCreatorAvatar(creator.id)
      .then((result) => {
        if (result.refreshed) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.creators.detail(creator.id) })
        }
      })
      .catch(() => {
        // refreshCreatorAvatar swallows its own errors; defensively catch
        // anything that escaped (e.g. IPC failure) so the renderer doesn't
        // see an unhandled rejection for cosmetic work.
      })
  }, [creator.id, needsAvatar, queryClient])

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
