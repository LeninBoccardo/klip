import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useCollection, useCollectionItems, useDeleteCollection } from '@/hooks/use-collections'
import { CollectionItemList } from '@components/features/collections/CollectionItemList'
import { RenameCollectionDialog } from '@components/features/collections/RenameCollectionDialog'
import { PageContainer, PageHeader } from '@/components/shared'
import { Button } from '@ui/button'
import { Skeleton } from '@ui/skeleton'
import { Empty, EmptyHeader, EmptyTitle } from '@ui/empty'
import { Play, Pencil, Trash2, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { usePlayerStore } from '@/hooks/use-player-store'
import type { CollectionItemDto } from '@shared/dtos'

export const Route = createFileRoute('/collections/$collectionId')({
  component: CollectionDetailPage
})

function CollectionDetailPage(): React.ReactElement {
  const { collectionId } = Route.useParams()
  const navigate = useNavigate()
  const collectionQuery = useCollection(collectionId)
  const itemsQuery = useCollectionItems(collectionId)
  const deleteCollection = useDeleteCollection()
  const playQueue = usePlayerStore((s) => s.playQueue)
  const [editing, setEditing] = useState(false)

  const collection = collectionQuery.data

  const handlePlayAll = (): void => {
    const items = itemsQuery.data ?? []
    const playable = items
      .filter((it): it is CollectionItemDto & { entity: NonNullable<typeof it.entity> } =>
        Boolean(it.entity && it.entity.status !== 'missing' && it.entity.status !== 'deleted')
      )
      .map((it) => ({
        kind: it.kind,
        id: it.entity.id,
        title: it.entity.title,
        creatorId: 'creatorId' in it.entity ? it.entity.creatorId : undefined
      }))

    if (playable.length === 0) {
      toast.error('No playable items in this collection.')
      return
    }
    playQueue(playable)
    // Route to the first item so the player attaches to its detail slot.
    const first = playable[0]
    if (first.kind === 'video') {
      navigate({ to: '/videos/$videoId', params: { videoId: first.id } })
    }
    // Cuts attach via mini-player on the current page (no /cuts/$id route yet).
  }

  const handleDelete = (): void => {
    if (!collection) return
    if (!window.confirm(`Delete collection "${collection.name}"?`)) return
    deleteCollection.mutate(collection.id, {
      onSuccess: () => {
        toast.success(`"${collection.name}" deleted`)
        navigate({ to: '/collections' })
      },
      onError: (err) => toast.error(`Failed to delete: ${err.message}`)
    })
  }

  if (collectionQuery.isLoading) {
    return (
      <PageContainer>
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </PageContainer>
    )
  }

  if (!collection) {
    return (
      <PageContainer>
        <Empty className="min-h-100 rounded-lg border">
          <EmptyHeader>
            <EmptyTitle>Collection not found</EmptyTitle>
          </EmptyHeader>
        </Empty>
        <Button variant="outline" onClick={() => navigate({ to: '/collections' })}>
          <ArrowLeft className="mr-2 size-4" />
          Back to collections
        </Button>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title={collection.name}
        description={collection.description ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate({ to: '/collections' })}>
              <ArrowLeft className="mr-2 size-4" />
              Back
            </Button>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="mr-2 size-4" />
              Edit
            </Button>
            <Button variant="outline" className="text-destructive" onClick={handleDelete}>
              <Trash2 className="mr-2 size-4" />
              Delete
            </Button>
            <Button onClick={handlePlayAll} disabled={collection.itemCount === 0}>
              <Play className="mr-2 size-4 fill-current" />
              Play all
            </Button>
          </div>
        }
      />

      <CollectionItemList collectionId={collectionId} />

      <RenameCollectionDialog open={editing} onOpenChange={setEditing} collection={collection} />
    </PageContainer>
  )
}
