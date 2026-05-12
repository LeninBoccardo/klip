import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useVideoById, useFetchVideoDetail } from '@/hooks/use-videos'
import { usePlayerStore } from '@/hooks/use-player-store'
import { useShortcut } from '@/hooks/use-shortcut'
import { PageContainer, PageHeader } from '@/components/shared'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/tabs'
import { Badge } from '@ui/badge'
import { Button } from '@ui/button'
import { Skeleton } from '@ui/skeleton'
import { Empty, EmptyHeader, EmptyTitle } from '@ui/empty'
import {
  Eye,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  RefreshCw,
  Loader2,
  Play,
  ExternalLink,
  AlertTriangle,
  Scissors
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDuration, formatFileSize, formatCount } from '@/lib/format'
import { useDateFormat } from '@/hooks/use-date-format'
import { useEffect, useState } from 'react'
import { CommentsTab } from '@components/features/videos/CommentsTab'
import { TranscriptTab } from '@components/features/videos/TranscriptTab'
import { EditableTagsCard } from '@components/features/videos/EditableTagsCard'
import { DetailPlayerSlot } from '@components/features/player/DetailPlayerSlot'
import { HistoryButton } from '@components/features/activity/HistoryButton'

export const Route = createFileRoute('/videos/$videoId')({
  component: VideoDetailPage
})

function VideoDetailPage(): React.ReactElement {
  const { t } = useTranslation('videos')
  const { videoId } = Route.useParams()
  const router = useRouter()
  const { data: video, isLoading } = useVideoById(videoId)
  const fetchDetail = useFetchVideoDetail()
  const { formatDate } = useDateFormat()
  const [tab, setTab] = useState('info')
  const play = usePlayerStore((s) => s.play)
  const setMode = usePlayerStore((s) => s.setMode)
  const activeVideoId = usePlayerStore((s) => s.videoId)
  const playerMode = usePlayerStore((s) => s.mode)

  useShortcut('escape', () => router.history.back())
  useShortcut('backspace', () => router.history.back())

  // If the user navigates to this page while the same video is in mini /
  // paused mode, promote the player back to in-page detail attachment so the
  // floating dock disappears and the placeholder takes over.
  useEffect(() => {
    if (activeVideoId === videoId && playerMode !== 'detail' && playerMode !== 'idle') {
      setMode('detail')
    }
  }, [activeVideoId, videoId, playerMode, setMode])

  const handleRefresh = (): void => {
    fetchDetail.mutate(videoId, {
      onSuccess: (result) => {
        // Metadata + view/like counts always update on a successful call.
        // Transcript is a sub-step that can fail independently (YouTube
        // rate-limits this endpoint aggressively). Surface the actual
        // outcome so the user knows whether to retry vs accept-and-move-on.
        toast.success(t('detail.metadataRefreshed'))
        switch (result.transcriptStatus) {
          case 'ok':
            break
          case 'unavailable':
            toast.info(t('detail.transcriptUnavailable'))
            break
          case 'rate-limited':
            toast.warning(t('detail.transcriptRateLimited'))
            break
          case 'error':
            toast.error(
              t('detail.transcriptFetchFailed', {
                message: result.transcriptError ?? 'unknown error'
              })
            )
            break
        }
      },
      onError: (err) => toast.error(t('detail.refreshFailed', { message: err.message }))
    })
  }

  if (isLoading) {
    return (
      <PageContainer>
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="aspect-video w-full rounded-xl" />
      </PageContainer>
    )
  }

  if (!video) {
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

  const everEnriched = video.detailFetchedAt !== null
  const isPlayingThis =
    activeVideoId === video.id && (playerMode === 'detail' || playerMode === 'mini')

  const handlePlay = (): void => {
    play({ videoId: video.id, title: video.title, mode: 'detail' })
  }

  const handleOpenExternal = async (): Promise<void> => {
    const result = await window.api.openMediaExternally('video', video.id)
    if (!result.ok) toast.error(result.error ?? t('detail.openFailed'))
  }

  const handleEdit = async (): Promise<void> => {
    // Refuse to open the editor on a source we have no duration for —
    // the timeline can't bound itself without it. The probe queue is
    // async; nudge the user to wait rather than opening a half-broken
    // editor window.
    if (!video.duration || video.duration <= 0) {
      toast.error(t('detail.editor.notProbedYet'))
      return
    }
    await window.api.editorOpenWindow({ sourceVideoId: video.id })
  }

  return (
    <PageContainer>
      <PageHeader
        title={video.title}
        description={
          video.uploadDate
            ? t('detail.uploaded', { date: formatDate(video.uploadDate) })
            : undefined
        }
        actions={
          <div className="flex items-center gap-2">
            <HistoryButton entityType="video" entityId={video.id} entityName={video.title} />
            <Button variant="outline" onClick={handleEdit}>
              <Scissors className="mr-2 size-4" />
              {t('detail.editor.openEditor')}
            </Button>
            <Button variant="outline" onClick={handleOpenExternal}>
              <ExternalLink className="mr-2 size-4" />
              {t('detail.openExternally')}
            </Button>
            <Button onClick={handleRefresh} disabled={fetchDetail.isPending} variant="outline">
              {fetchDetail.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 size-4" />
              )}
              {everEnriched ? t('detail.refreshMetadata') : t('detail.fetchMetadata')}
            </Button>
          </div>
        }
      />

      {video.status === 'missing' && (
        <div className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="flex-1 space-y-2">
            <div>
              <p className="font-medium">{t('detail.missing.title')}</p>
              <p className="text-muted-foreground">{t('detail.missing.body')}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefresh}
              disabled={fetchDetail.isPending}
            >
              {fetchDetail.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 size-4" />
              )}
              {t('detail.missing.retry')}
            </Button>
          </div>
        </div>
      )}

      <div className="relative">
        <DetailPlayerSlot />
        {!isPlayingThis && (
          <button
            type="button"
            onClick={handlePlay}
            aria-label={t('detail.playAria', { title: video.title })}
            className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 text-white transition-colors hover:bg-black/55"
          >
            <Play className="size-12 fill-white" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile
          icon={<Eye className="size-4" />}
          label={t('detail.stats.views')}
          value={formatCount(video.viewCount)}
        />
        <StatTile
          icon={<ThumbsUp className="size-4" />}
          label={t('detail.stats.likes')}
          value={formatCount(video.likeCount)}
        />
        <StatTile
          icon={<ThumbsDown className="size-4" />}
          label={t('detail.stats.dislikes')}
          value={formatCount(video.dislikeCount)}
        />
        <StatTile
          icon={<MessageSquare className="size-4" />}
          label={t('detail.stats.comments')}
          value={formatCount(video.commentCount)}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="info">{t('detail.tabs.info')}</TabsTrigger>
          <TabsTrigger value="transcript">{t('detail.tabs.transcript')}</TabsTrigger>
          <TabsTrigger value="comments">{t('detail.tabs.comments')}</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('detail.file.title')}</CardTitle>
              <CardDescription>{t('detail.file.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Row label={t('detail.file.duration')} value={formatDuration(video.duration)} />
              <Row label={t('detail.file.resolution')} value={video.resolution ?? '—'} />
              <Row label={t('detail.file.size')} value={formatFileSize(video.fileSize)} />
              <Row label={t('detail.file.url')} value={video.url ?? '—'} mono />
            </CardContent>
          </Card>

          <EditableTagsCard
            entityKind="video"
            entityId={video.id}
            tags={video.tags}
            readOnlyExtras={
              video.isShort || video.category ? (
                <>
                  {video.isShort && (
                    <Badge variant="destructive">{t('detail.categoryBadges.short')}</Badge>
                  )}
                  {video.category && <Badge variant="secondary">{video.category}</Badge>}
                </>
              ) : undefined
            }
          />

          {video.description && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('detail.description.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {video.description}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="transcript" className="mt-4">
          <TranscriptTab
            videoId={videoId}
            hasTranscript={video.hasTranscript}
            everEnriched={everEnriched}
            durationSeconds={video.duration}
          />
        </TabsContent>

        <TabsContent value="comments" className="mt-4">
          <CommentsTab videoId={videoId} knownCount={video.commentCount} />
        </TabsContent>
      </Tabs>
    </PageContainer>
  )
}

function StatTile({
  icon,
  label,
  value
}: {
  icon: React.ReactNode
  label: string
  value: string
}): React.ReactElement {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <span className="text-xl font-semibold">{value}</span>
      </CardContent>
    </Card>
  )
}

function Row({
  label,
  value,
  mono
}: {
  label: string
  value: string
  mono?: boolean
}): React.ReactElement {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? 'truncate font-mono text-xs' : 'truncate'}>{value}</span>
    </div>
  )
}
