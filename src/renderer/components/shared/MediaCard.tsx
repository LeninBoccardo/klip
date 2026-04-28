import { Card, CardContent } from '@/components/ui/card'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { formatDuration, formatFileSize, mediaUrl } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Film } from 'lucide-react'
import type { EntityStatus } from '@shared/types'

interface MediaCardProps {
  /** Entity kind that owns the thumbnail asset. */
  entityKind: 'video' | 'cut'
  /** Entity id used to resolve `klip-media://<kind>/<id>/thumbnail`. */
  entityId: string
  /** Whether the entity has a local thumbnail file. Drives the fallback icon. */
  hasThumbnail: boolean
  title: string
  status: EntityStatus
  duration: number | null
  resolution: string | null
  fileSize: number | null
  /** When true, render a small "Short" overlay badge on the thumbnail */
  isShort?: boolean
  onClick?: () => void
  className?: string
}

export function MediaCard({
  entityKind,
  entityId,
  hasThumbnail,
  title,
  status,
  duration,
  resolution,
  fileSize,
  isShort,
  onClick,
  className
}: MediaCardProps): React.ReactElement {
  const src = hasThumbnail ? mediaUrl(entityKind, entityId, 'thumbnail') : undefined

  return (
    <Card
      className={cn(
        'group overflow-hidden transition-colors hover:bg-accent/50 cursor-pointer',
        status === 'deleted' && 'opacity-60',
        className
      )}
      onClick={onClick}
    >
      <AspectRatio ratio={16 / 9} className="bg-muted">
        {src ? (
          <img src={src} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Film className="size-8" />
          </div>
        )}
        {duration != null && (
          <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
            {formatDuration(duration)}
          </span>
        )}
        {isShort && (
          <span className="absolute top-1 left-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            Short
          </span>
        )}
      </AspectRatio>
      <CardContent className="space-y-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 text-sm font-medium leading-tight">{title}</p>
          <StatusBadge status={status} />
        </div>
        <p className="text-xs text-muted-foreground">
          {[resolution, formatFileSize(fileSize)].filter((v) => v && v !== '—').join(' · ') || '—'}
        </p>
      </CardContent>
    </Card>
  )
}

MediaCard.displayName = 'MediaCard'
