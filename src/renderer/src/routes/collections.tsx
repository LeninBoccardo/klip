import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCollectionsPaginated, useDeleteCollection } from '@/hooks/use-collections'
import { CollectionCard } from '@components/features/collections/CollectionCard'
import { CollectionContextMenu } from '@components/features/collections/CollectionContextMenu'
import { CreateCollectionDialog } from '@components/features/collections/CreateCollectionDialog'
import { RenameCollectionDialog } from '@components/features/collections/RenameCollectionDialog'
import { PageContainer, PageHeader, PaginationControls, ResponsiveGrid } from '@/components/shared'
import { Button } from '@ui/button'
import { Skeleton } from '@ui/skeleton'
import { Empty, EmptyContent, EmptyHeader, EmptyTitle, EmptyDescription } from '@ui/empty'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { CollectionDto } from '@shared/dtos'

export const Route = createFileRoute('/collections')({
  component: CollectionsPage
})

const PAGE_SIZE = 24

function CollectionsPage(): React.ReactElement {
  const { t } = useTranslation('collections')
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<CollectionDto | null>(null)

  const { data, isLoading } = useCollectionsPaginated({ page, pageSize: PAGE_SIZE })
  const deleteCollection = useDeleteCollection()

  const handleDelete = (collection: CollectionDto): void => {
    if (!window.confirm(t('deleteConfirm', { name: collection.name }))) return
    deleteCollection.mutate(collection.id, {
      onSuccess: () => toast.success(t('toasts.deleted', { name: collection.name })),
      onError: (err) => toast.error(t('toasts.deleteFailed', { message: err.message }))
    })
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('page.title')}
        description={t('page.description')}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 size-4" />
            {t('page.newButton')}
          </Button>
        }
      />

      {isLoading ? (
        <ResponsiveGrid columns="wide">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </ResponsiveGrid>
      ) : !data || data.data.length === 0 ? (
        <Empty className="min-h-100 rounded-lg border">
          <EmptyHeader>
            <EmptyTitle>{t('empty.title')}</EmptyTitle>
            <EmptyDescription>{t('empty.description')}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 size-4" />
              {t('empty.cta')}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <ResponsiveGrid columns="wide">
            {data.data.map((c) => (
              <CollectionContextMenu
                key={c.id}
                onEdit={() => setEditing(c)}
                onDelete={() => handleDelete(c)}
              >
                <CollectionCard
                  collection={c}
                  onClick={() =>
                    navigate({
                      to: '/collections/$collectionId',
                      params: { collectionId: c.id }
                    })
                  }
                />
              </CollectionContextMenu>
            ))}
          </ResponsiveGrid>

          <PaginationControls
            page={data.page}
            totalPages={data.totalPages}
            onPageChange={setPage}
          />
        </>
      )}

      <CreateCollectionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(created) =>
          navigate({
            to: '/collections/$collectionId',
            params: { collectionId: created.id }
          })
        }
      />

      <RenameCollectionDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        collection={editing}
      />
    </PageContainer>
  )
}
