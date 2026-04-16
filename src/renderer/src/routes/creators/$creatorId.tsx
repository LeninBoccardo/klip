import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useCreatorById } from '@/hooks/use-creators'
import { useVideosPaginated, useDeleteVideo, useRestoreVideo } from '@/hooks/use-videos'
import { useCutsPaginated, useDeleteCut, useRestoreCut } from '@/hooks/use-cuts'
import { CreatorHeader } from '@components/features/creators/CreatorHeader'
import {
  PageContainer,
  MediaCard,
  ResponsiveGrid,
  PaginationControls,
  EntityContextMenu
} from '@/components/shared'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/tabs'
import { Skeleton } from '@ui/skeleton'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@ui/empty'
import { Film, Scissors } from 'lucide-react'
import { toast } from 'sonner'

export const Route = createFileRoute('/creators/$creatorId')({
  component: CreatorDetailPage
})

function CreatorDetailPage() {
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
            <EmptyTitle>Creator not found</EmptyTitle>
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
          <TabsTrigger value="videos">Videos</TabsTrigger>
          <TabsTrigger value="cuts">Cuts</TabsTrigger>
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

function VideosTab({ creatorId }: { creatorId: string }) {
  const [page, setPage] = useState(1)
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
          <EmptyTitle>No videos</EmptyTitle>
          <EmptyDescription>Download videos for this creator to see them here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="space-y-4">
      <ResponsiveGrid>
        {data.data.map((video) => (
          <EntityContextMenu
            key={video.id}
            status={video.status}
            onDelete={() =>
              deleteVideo.mutate(video.id, {
                onSuccess: () => toast.success(`"${video.title}" deleted`),
                onError: (err) => toast.error(err.message)
              })
            }
            onRestore={() =>
              restoreVideo.mutate(video.id, {
                onSuccess: () => toast.success(`"${video.title}" restored`),
                onError: (err) => toast.error(err.message)
              })
            }
          >
            <MediaCard
              title={video.title}
              status={video.status}
              thumbnailPath={video.thumbnailPath}
              duration={video.duration}
              resolution={video.resolution}
              fileSize={video.fileSize}
            />
          </EntityContextMenu>
        ))}
      </ResponsiveGrid>
      <PaginationControls page={data.page} totalPages={data.totalPages} onPageChange={setPage} />
    </div>
  )
}

function CutsTab({ creatorId }: { creatorId: string }) {
  const [page, setPage] = useState(1)
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
          <EmptyTitle>No cuts</EmptyTitle>
          <EmptyDescription>
            Export cuts from your editor into this creator&apos;s cuts folder.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="space-y-4">
      <ResponsiveGrid>
        {data.data.map((cut) => (
          <EntityContextMenu
            key={cut.id}
            status={cut.status}
            onDelete={() =>
              deleteCut.mutate(cut.id, {
                onSuccess: () => toast.success(`"${cut.title}" deleted`),
                onError: (err) => toast.error(err.message)
              })
            }
            onRestore={() =>
              restoreCut.mutate(cut.id, {
                onSuccess: () => toast.success(`"${cut.title}" restored`),
                onError: (err) => toast.error(err.message)
              })
            }
          >
            <MediaCard
              title={cut.title}
              status={cut.status}
              thumbnailPath={cut.thumbnailPath}
              duration={cut.duration}
              resolution={cut.resolution}
              fileSize={cut.fileSize}
            />
          </EntityContextMenu>
        ))}
      </ResponsiveGrid>
      <PaginationControls page={data.page} totalPages={data.totalPages} onPageChange={setPage} />
    </div>
  )
}
