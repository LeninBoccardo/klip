import { createFileRoute } from '@tanstack/react-router'
import { useVideoById, useFetchVideoDetail, useTranscript } from '@/hooks/use-videos'
import { PageContainer, PageHeader } from '@/components/shared'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/tabs'
import { Badge } from '@ui/badge'
import { Button } from '@ui/button'
import { Skeleton } from '@ui/skeleton'
import { ScrollArea } from '@ui/scroll-area'
import { AspectRatio } from '@ui/aspect-ratio'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@ui/empty'
import { Eye, ThumbsUp, ThumbsDown, MessageSquare, RefreshCw, Loader2, Film, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { formatDuration, formatFileSize, toMediaSrc } from '@/lib/format'
import { useState } from 'react'

export const Route = createFileRoute('/videos/$videoId')({
  component: VideoDetailPage
})

function formatCount(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n < 1000) return n.toString()
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  return `${(n / 1_000_000_000).toFixed(1)}B`
}

function VideoDetailPage() {
  const { videoId } = Route.useParams()
  const { data: video, isLoading } = useVideoById(videoId)
  const fetchDetail = useFetchVideoDetail()
  const transcriptQuery = useTranscript(videoId)
  const [tab, setTab] = useState('info')

  const handleRefresh = () => {
    fetchDetail.mutate(videoId, {
      onSuccess: () => toast.success('Metadata refreshed'),
      onError: (err) => toast.error(`Refresh failed: ${err.message}`)
    })
  }

  const handleCopyTranscript = () => {
    if (!transcriptQuery.data) return
    navigator.clipboard.writeText(transcriptQuery.data)
    toast.success('Transcript copied to clipboard')
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
            <EmptyTitle>Video not found</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </PageContainer>
    )
  }

  const thumb = toMediaSrc(video.thumbnailPath)
  const everEnriched = video.detailFetchedAt !== null

  return (
    <PageContainer>
      <PageHeader
        title={video.title}
        description={video.uploadDate ? `Uploaded ${video.uploadDate}` : undefined}
        actions={
          <Button onClick={handleRefresh} disabled={fetchDetail.isPending} variant="outline">
            {fetchDetail.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 size-4" />
            )}
            {everEnriched ? 'Refresh metadata' : 'Fetch metadata'}
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          <AspectRatio ratio={16 / 9} className="bg-muted">
            {thumb ? (
              <img src={thumb} alt={video.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <Film className="size-12" />
              </div>
            )}
          </AspectRatio>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile icon={<Eye className="size-4" />} label="Views" value={formatCount(video.viewCount)} />
        <StatTile icon={<ThumbsUp className="size-4" />} label="Likes" value={formatCount(video.likeCount)} />
        <StatTile icon={<ThumbsDown className="size-4" />} label="Dislikes" value={formatCount(video.dislikeCount)} />
        <StatTile icon={<MessageSquare className="size-4" />} label="Comments" value={formatCount(video.commentCount)} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="transcript">Transcript</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">File</CardTitle>
              <CardDescription>Local media metadata.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Row label="Duration" value={formatDuration(video.duration)} />
              <Row label="Resolution" value={video.resolution ?? '—'} />
              <Row label="Size" value={formatFileSize(video.fileSize)} />
              <Row label="URL" value={video.url ?? '—'} mono />
              <Row label="Path" value={video.filePath} mono />
            </CardContent>
          </Card>

          {(video.category || video.tags.length > 0 || video.isShort) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tags</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {video.isShort && <Badge variant="destructive">Short</Badge>}
                {video.category && <Badge variant="secondary">{video.category}</Badge>}
                {video.tags.map((t) => (
                  <Badge key={t} variant="outline">
                    {t}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}

          {video.description && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Description</CardTitle>
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
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Auto-transcript</CardTitle>
                <CardDescription>
                  {video.transcriptPath
                    ? 'Generated by yt-dlp from auto-captions.'
                    : 'No transcript fetched yet.'}
                </CardDescription>
              </div>
              {transcriptQuery.data && (
                <Button size="sm" variant="outline" onClick={handleCopyTranscript}>
                  <Copy className="mr-2 size-4" />
                  Copy
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {transcriptQuery.isLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : transcriptQuery.data ? (
                <ScrollArea className="max-h-[500px] rounded border">
                  <pre className="whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed">
                    {transcriptQuery.data}
                  </pre>
                </ScrollArea>
              ) : (
                <Empty className="min-h-[200px]">
                  <EmptyHeader>
                    <EmptyTitle>No transcript available</EmptyTitle>
                    <EmptyDescription>
                      {everEnriched
                        ? 'This video has no auto-generated captions.'
                        : 'Click "Fetch metadata" to retrieve the auto-generated transcript.'}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>
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
}) {
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
}) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? 'truncate font-mono text-xs' : 'truncate'}>{value}</span>
    </div>
  )
}
