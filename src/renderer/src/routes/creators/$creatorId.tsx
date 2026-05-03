import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreatorById } from '@/hooks/use-creators'
import { useVideosPaginated, useDeleteVideo, useRestoreVideo } from '@/hooks/use-videos'
import { useCutsPaginated, useDeleteCut, useRestoreCut } from '@/hooks/use-cuts'
import { useMultiSelect } from '@/hooks/use-multi-select'
import { CreatorHeader } from '@components/features/creators/CreatorHeader'
import {
  PageContainer,
  MediaCard,
  ResponsiveGrid,
  PaginationControls,
  EntityContextMenu,
  SelectableEntity,
  BulkActionsBar
} from '@/components/shared'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/tabs'
import { Skeleton } from '@ui/skeleton'
import { Button } from '@ui/button'
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription
} from '@ui/empty'
import { Film, Scissors, CheckSquare, Square, Download } from 'lucide-react'
import { toast } from 'sonner'
import { AddToCollectionDialog } from '@components/features/collections/AddToCollectionDialog'
import type { CollectionItemKind } from '@shared/types'

export const Route = createFileRoute('/creators/$creatorId')({
  component: CreatorDetailPage
})

function CreatorDetailPage(): React.ReactElement {
  const { t } = useTranslation('creators')
  const { creatorId } = Route.useParams()
  const { data: creator, isLoading: creatorLoading } = useCreatorById(creatorId)

  if (creatorLoading) {
    return (
      <PageContainer>
        <Skeleton className="h-14 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </PageContainer>
    )
  }

  if (!creator) {
    return (
      <PageContainer>
        <Empty className="min-h-[400px] border rounded-lg">
          <EmptyHeader>
            <EmptyTitle>{t('detail.notFound')}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <CreatorHeader creator={creator} />
      <Tabs defaultValue="videos">
        <TabsList>
          <TabsTrigger value="videos">{t('detail.tabs.videos')}</TabsTrigger>
          <TabsTrigger value="cuts">{t('detail.tabs.cuts')}</TabsTrigger>
        </TabsList>
        <TabsContent value="videos" className="mt-4">
          <VideosTab creatorId={creatorId} />
        </TabsContent>
        <TabsContent value="cuts" className="mt-4">
          <CutsTab creatorId={creatorId} />
        </TabsContent>
      </Tabs>
    </PageContainer>
  )
}

function VideosTab({ creatorId }: { creatorId: string }): React.ReactElement {
  const { t } = useTranslation('creators')
  const { t: tc } = useTranslation('common')
  const { t: tl } = useTranslation('library')
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [selectMode, setSelectMode] = useState(false)
  const selection = useMultiSelect()
  const [addTarget, setAddTarget] = useState<{
    kind: CollectionItemKind
    id: string
    title: string
  } | null>(null)
  const { data, isLoading } = useVideosPaginated({ page, pageSize: 20, creatorId })
  const deleteVideo = useDeleteVideo()
  const restoreVideo = useRestoreVideo()

  if (isLoading) {
    return (
      <ResponsiveGrid>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-video rounded-xl" />
        ))}
      </ResponsiveGrid>
    )
  }

  if (!data || data.data.length === 0) {
    return (
      <Empty className="min-h-[200px] border rounded-lg">
        <EmptyHeader>
          <EmptyMedia>
            <Film className="size-8 text-muted-foreground" />
          </EmptyMedia>
          <EmptyTitle>{t('detail.videos.emptyTitle')}</EmptyTitle>
          <EmptyDescription>{t('detail.videos.emptyDescription')}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={() => navigate({ to: '/downloads' })}>
            <Download className="mr-2 size-4" />
            {t('detail.videos.emptyCta')}
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  const exitSelectMode = (): void => {
    setSelectMode(false)
    selection.clear()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {selectMode ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => selection.selectAll(data.data.map((v) => v.id))}
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
          entityKind="video"
          selectedIds={[...selection.selectedIds]}
          onClear={exitSelectMode}
        />
      )}

      <ResponsiveGrid>
        {data.data.map((video) => {
          const card = (
            <MediaCard
              entityKind="video"
              entityId={video.id}
              hasThumbnail={video.hasThumbnail}
              title={video.title}
              status={video.status}
              duration={video.duration}
              resolution={video.resolution}
              fileSize={video.fileSize}
              isShort={video.isShort}
              onClick={() =>
                navigate({
                  to: '/videos/$videoId',
                  params: { videoId: video.id }
                })
              }
            />
          )

          if (selectMode) {
            return (
              <SelectableEntity
                key={video.id}
                selectable
                selected={selection.selectedIds.has(video.id)}
                onToggle={() => selection.toggle(video.id)}
              >
                {card}
              </SelectableEntity>
            )
          }

          return (
            <EntityContextMenu
              key={video.id}
              status={video.status}
              onAddToCollection={() =>
                setAddTarget({ kind: 'video', id: video.id, title: video.title })
              }
              onDelete={() =>
                deleteVideo.mutate(video.id, {
                  onSuccess: () => toast.success(tl('toasts.deleted', { name: video.title })),
                  onError: (err) => toast.error(err.message)
                })
              }
              onRestore={() =>
                restoreVideo.mutate(video.id, {
                  onSuccess: () => toast.success(tl('toasts.restored', { name: video.title })),
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

      <PaginationControls page={data.page} totalPages={data.totalPages} onPageChange={setPage} />

      <AddToCollectionDialog
        open={addTarget !== null}
        onOpenChange={(open) => {
          if (!open) setAddTarget(null)
        }}
        entity={addTarget}
      />
    </div>
  )
}

function CutsTab({ creatorId }: { creatorId: string }): React.ReactElement {
  const { t } = useTranslation('creators')
  const { t: tc } = useTranslation('common')
  const { t: tl } = useTranslation('library')
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [selectMode, setSelectMode] = useState(false)
  const selection = useMultiSelect()
  const [addTarget, setAddTarget] = useState<{
    kind: CollectionItemKind
    id: string
    title: string
  } | null>(null)
  const { data, isLoading } = useCutsPaginated({ page, pageSize: 20, creatorId })
  const deleteCut = useDeleteCut()
  const restoreCut = useRestoreCut()

  if (isLoading) {
    return (
      <ResponsiveGrid>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-video rounded-xl" />
        ))}
      </ResponsiveGrid>
    )
  }

  if (!data || data.data.length === 0) {
    return (
      <Empty className="min-h-[200px] border rounded-lg">
        <EmptyHeader>
          <EmptyMedia>
            <Scissors className="size-8 text-muted-foreground" />
          </EmptyMedia>
          <EmptyTitle>{t('detail.cuts.emptyTitle')}</EmptyTitle>
          <EmptyDescription>{t('detail.cuts.emptyDescription')}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={() => navigate({ to: '/cuts' })}>
            {t('detail.cuts.emptyCta')}
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  const exitSelectMode = (): void => {
    setSelectMode(false)
    selection.clear()
  }

  return (
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
              onAddToCollection={() => setAddTarget({ kind: 'cut', id: cut.id, title: cut.title })}
              onDelete={() =>
                deleteCut.mutate(cut.id, {
                  onSuccess: () => toast.success(tl('toasts.deleted', { name: cut.title })),
                  onError: (err) => toast.error(err.message)
                })
              }
              onRestore={() =>
                restoreCut.mutate(cut.id, {
                  onSuccess: () => toast.success(tl('toasts.restored', { name: cut.title })),
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

      <PaginationControls page={data.page} totalPages={data.totalPages} onPageChange={setPage} />

      <AddToCollectionDialog
        open={addTarget !== null}
        onOpenChange={(open) => {
          if (!open) setAddTarget(null)
        }}
        entity={addTarget}
      />
    </div>
  )
}
