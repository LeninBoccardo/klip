import { useMemo } from 'react'
import { Card, CardContent } from '@ui/card'
import { Button } from '@ui/button'
import { Badge } from '@ui/badge'
import { ChevronUp, ChevronDown, Trash2, Film, Scissors, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from '@tanstack/react-router'
import {
  useCollectionItems,
  useReorderCollection,
  useRemoveFromCollection
} from '@/hooks/use-collections'
import { usePlayerStore } from '@/hooks/use-player-store'
import { mediaUrl } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@ui/empty'
import { Skeleton } from '@ui/skeleton'
import type { CollectionItemDto } from '@shared/dtos'

interface CollectionItemListProps {
  collectionId: string
}

/**
 * Renders the ordered items in a collection.
 *
 * Reorder UX: each row carries up / down chevron buttons that swap the
 * row with its neighbour and fire `reorderCollection` with the full new
 * order. Drag-and-drop will land in a follow-up; the keyboard-accessible
 * buttons are the v1 baseline. Rows whose underlying entity is missing
 * render as tombstones with a warning badge but stay reorderable.
 */
export function CollectionItemList({ collectionId }: CollectionItemListProps): React.ReactElement {
  const itemsQuery = useCollectionItems(collectionId)
  const reorder = useReorderCollection()
  const remove = useRemoveFromCollection()
  const navigate = useNavigate()
  const play = usePlayerStore((s) => s.play)

  // Stable identity keys so React rendering doesn't churn on adjacent re-renders.
  // Memoise off the raw query data — React Query returns the same reference for
  // equal-by-value cache hits, so a `data ?? []` fallback inside useMemo would
  // create a fresh empty array every render and bust memoisation.
  const data = itemsQuery.data
  const keyed = useMemo(() => (data ?? []).map((item) => ({ key: itemKey(item), item })), [data])
  const items = data ?? []

  const handleSwap = (index: number, direction: -1 | 1): void => {
    const next = index + direction
    if (next < 0 || next >= items.length) return
    const reordered = [...items]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(next, 0, moved)
    reorder.mutate(
      {
        collectionId,
        items: reordered.map((it) => ({ kind: it.kind, id: idOf(it) }))
      },
      {
        onError: (err) => toast.error(`Reorder failed: ${err.message}`)
      }
    )
  }

  const handleRemove = (item: CollectionItemDto): void => {
    remove.mutate(
      { collectionId, kind: item.kind, id: idOf(item) },
      {
        onError: (err) => toast.error(`Remove failed: ${err.message}`)
      }
    )
  }

  const handlePlay = (item: CollectionItemDto): void => {
    if (!item.entity || item.entity.status === 'missing') {
      toast.error('This item is missing on disk.')
      return
    }
    if (item.kind === 'video') {
      play({
        videoId: item.entity.id,
        title: item.entity.title,
        mediaKind: 'video',
        mode: 'detail'
      })
      navigate({ to: '/videos/$videoId', params: { videoId: item.entity.id } })
    } else {
      // Cuts have no detail route yet; stay on the current page and let the
      // mini-player attach. The "Play all" path handles routing differently.
      play({
        videoId: item.entity.id,
        title: item.entity.title,
        mediaKind: 'cut',
        mode: 'mini'
      })
    }
  }

  if (itemsQuery.isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <Empty className="min-h-50 rounded-lg border">
        <EmptyHeader>
          <EmptyTitle>No items yet</EmptyTitle>
          <EmptyDescription>Add videos and cuts from the library context menu.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="space-y-2">
      {keyed.map(({ key, item }, index) => (
        <CollectionRow
          key={key}
          item={item}
          isFirst={index === 0}
          isLast={index === items.length - 1}
          onMoveUp={() => handleSwap(index, -1)}
          onMoveDown={() => handleSwap(index, 1)}
          onRemove={() => handleRemove(item)}
          onPlay={() => handlePlay(item)}
          disabled={reorder.isPending || remove.isPending}
        />
      ))}
    </div>
  )
}

function CollectionRow({
  item,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRemove,
  onPlay,
  disabled
}: {
  item: CollectionItemDto
  isFirst: boolean
  isLast: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
  onPlay: () => void
  disabled: boolean
}): React.ReactElement {
  const entity = item.entity
  const missing = !entity || entity.status === 'missing' || entity.status === 'deleted'
  const title = entity?.title ?? '(unavailable)'
  const thumb =
    entity && entity.hasThumbnail ? mediaUrl(item.kind, entity.id, 'thumbnail') : undefined

  return (
    <Card className={cn(missing && 'opacity-60')}>
      <CardContent className="flex items-center gap-3 p-3">
        <div className="flex flex-col gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            className="size-6"
            disabled={disabled || isFirst}
            aria-label="Move up"
            onClick={onMoveUp}
          >
            <ChevronUp className="size-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-6"
            disabled={disabled || isLast}
            aria-label="Move down"
            onClick={onMoveDown}
          >
            <ChevronDown className="size-3" />
          </Button>
        </div>

        <button
          type="button"
          onClick={onPlay}
          disabled={missing}
          aria-label={`Play ${title}`}
          className="flex flex-1 items-center gap-3 text-left disabled:cursor-not-allowed"
        >
          <div className="relative h-10 w-16 shrink-0 overflow-hidden rounded bg-muted">
            {thumb ? (
              <img src={thumb} alt={title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                {item.kind === 'video' ? (
                  <Film className="size-4" />
                ) : (
                  <Scissors className="size-4" />
                )}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{title}</p>
            <p className="text-xs text-muted-foreground capitalize">{item.kind}</p>
          </div>
        </button>

        {missing && (
          <Badge variant="outline" className="gap-1 text-xs text-amber-600">
            <AlertTriangle className="size-3" />
            Missing
          </Badge>
        )}

        <Button
          size="icon"
          variant="ghost"
          className="size-7 text-destructive"
          aria-label="Remove from collection"
          disabled={disabled}
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      </CardContent>
    </Card>
  )
}

function itemKey(item: CollectionItemDto): string {
  return `${item.kind}:${idOf(item)}:${item.position}`
}

function idOf(item: CollectionItemDto): string {
  // Items where the entity was hard-deleted shouldn't normally reach the UI
  // (FK CASCADE removes the join row), but if they do we have nothing to
  // reorder against — fall back to position as a string so the row stays
  // unique inside the React tree.
  return item.entity?.id ?? `__missing__${item.position}`
}
