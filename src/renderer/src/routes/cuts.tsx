import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCutsPaginated, useDeleteCut, useRestoreCut } from '@/hooks/use-cuts'
import { useMultiSelect } from '@/hooks/use-multi-select'
import {
  PageContainer,
  PageHeader,
  MediaCard,
  ResponsiveGrid,
  PaginationControls,
  EntityContextMenu,
  SelectableEntity,
  BulkActionsBar
} from '@/components/shared'
import { CutsFilters, sortKeyToParams, type CutsSortKey } from '@components/features/cuts/CutsFilters'
import { AddToCollectionDialog } from '@components/features/collections/AddToCollectionDialog'
import { Button } from '@ui/button'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@ui/empty'
import { Skeleton } from '@ui/skeleton'
import { Scissors, CheckSquare, Square } from 'lucide-react'
import { toast } from 'sonner'
import type { CollectionItemKind, EntityStatus } from '@shared/types'

export const Route = createFileRoute('/cuts')({
  component: CutsPage
})

function CutsPage(): React.ReactElement {
  const { t } = useTranslation('cuts')
  const { t: tc } = useTranslation('common')
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<EntityStatus[] | undefined>(undefined)
  const [creatorId, setCreatorId] = useState<string | undefined>(undefined)
  const [tags, setTags] = useState<string[]>([])
  const [sort, setSort] = useState<CutsSortKey>('recent')
  const [selectMode, setSelectMode] = useState(false)
  const selection = useMultiSelect()
  const [addTarget, setAddTarget] = useState<{
    kind: CollectionItemKind
    id: string
    title: string
  } | null>(null)

  const { sortBy, sortDirection } = sortKeyToParams(sort)
  const { data, isLoading } = useCutsPaginated({
    page,
    pageSize: 24,
    search: search || undefined,
    status: statusFilter,
    creatorId,
    tags: tags.length > 0 ? tags : undefined,
    sortBy,
    sortDirection
  })
  const deleteCut = useDeleteCut()
  const restoreCut = useRestoreCut()

  const hasFilters =
    search.length > 0 || creatorId !== undefined || tags.length > 0 || statusFilter !== undefined

  const exitSelectMode = (): void => {
    setSelectMode(false)
    selection.clear()
  }

  const resetPageOn = <T,>(setter: (v: T) => void): ((v: T) => void) => {
    return (v) => {
      setter(v)
      setPage(1)
    }
  }

  return (
    <PageContainer>
      <PageHeader title={t('page.title')} description={t('page.description')} />

      <CutsFilters
        search={search}
        onSearchChange={resetPageOn(setSearch)}
        statusFilter={statusFilter}
        onStatusFilterChange={resetPageOn(setStatusFilter)}
        creatorId={creatorId}
        onCreatorChange={resetPageOn(setCreatorId)}
        tags={tags}
        onTagsChange={resetPageOn(setTags)}
        sort={sort}
        onSortChange={resetPageOn(setSort)}
      />

      {isLoading && (
        <ResponsiveGrid>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-video rounded-xl" />
          ))}
        </ResponsiveGrid>
      )}

      {!isLoading && data && data.data.length === 0 && (
        <Empty className="min-h-[300px] border rounded-lg">
          <EmptyHeader>
            <EmptyMedia>
              <Scissors className="size-10 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle>{t('empty.title')}</EmptyTitle>
            <EmptyDescription>
              {hasFilters ? t('empty.withFilters') : t('empty.withoutFilters')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {!isLoading && data && data.data.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            {selectMode ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => selection.selectAll(data.data.map((c) => c.id))}
              >
                <CheckSquare className="mr-2 size-4" />
                {tc('actions.selectAllOnPage')}
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setSelectMode(true)}>
                <Square className="mr-2 size-4" />
                {tc('actions.select')}
              </Button>
            )}
          </div>

          {selectMode && selection.hasSelection && (
            <BulkActionsBar
              entityKind="cut"
              selectedIds={[...selection.selectedIds]}
              onClear={exitSelectMode}
            />
          )}

          <ResponsiveGrid>
            {data.data.map((cut) => {
              const card = (
                <MediaCard
                  entityKind="cut"
                  entityId={cut.id}
                  hasThumbnail={cut.hasThumbnail}
                  title={cut.title}
                  status={cut.status}
                  duration={cut.duration}
                  resolution={cut.resolution}
                  fileSize={cut.fileSize}
                  onClick={() => {
                    if (cut.videoId) {
                      navigate({ to: '/videos/$videoId', params: { videoId: cut.videoId } })
                    }
                  }}
                />
              )

              if (selectMode) {
                return (
                  <SelectableEntity
                    key={cut.id}
                    selectable
                    selected={selection.selectedIds.has(cut.id)}
                    onToggle={() => selection.toggle(cut.id)}
                  >
                    {card}
                  </SelectableEntity>
                )
              }

              return (
                <EntityContextMenu
                  key={cut.id}
                  status={cut.status}
                  onAddToCollection={() =>
                    setAddTarget({ kind: 'cut', id: cut.id, title: cut.title })
                  }
                  onDelete={() =>
                    deleteCut.mutate(cut.id, {
                      onSuccess: () => toast.success(t('toasts.deleted', { name: cut.title })),
                      onError: (err) => toast.error(err.message)
                    })
                  }
                  onRestore={() =>
                    restoreCut.mutate(cut.id, {
                      onSuccess: () => toast.success(t('toasts.restored', { name: cut.title })),
                      onError: (err) => toast.error(err.message)
                    })
                  }
                >
                  {card}
                </EntityContextMenu>
              )
            })}
          </ResponsiveGrid>

          {selectMode && (
            <Button size="sm" variant="ghost" onClick={exitSelectMode}>
              {tc('actions.done')}
            </Button>
          )}

          <PaginationControls
            page={data.page}
            totalPages={data.totalPages}
            onPageChange={setPage}
          />
        </div>
      )}

      <AddToCollectionDialog
        open={addTarget !== null}
        onOpenChange={(open) => {
          if (!open) setAddTarget(null)
        }}
        entity={addTarget}
      />
    </PageContainer>
  )
}
