import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useFetchVideoInfo, useDownloadVideo } from '@/hooks/use-downloads'
import { UrlInput } from '@components/features/downloads/UrlInput'
import { VideoInfoPreview } from '@components/features/downloads/VideoInfoPreview'
import { CreatorSelector } from '@components/features/downloads/CreatorSelector'
import { ActiveDownloadsList } from '@components/features/downloads/ActiveDownloadsList'
import { PageContainer, PageHeader } from '@/components/shared'
import { Button } from '@ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@ui/card'
import { Separator } from '@ui/separator'
import { Loader2, Download } from 'lucide-react'
import { toast } from 'sonner'
import type { VideoInfo } from '@shared/types'

export const Route = createFileRoute('/downloads')({
  component: DownloadsPage
})

function DownloadsPage() {
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)
  const [fetchedUrl, setFetchedUrl] = useState('')
  const [creatorName, setCreatorName] = useState('')

  const fetchInfo = useFetchVideoInfo()
  const download = useDownloadVideo()

  const handleFetchInfo = (url: string) => {
    setVideoInfo(null)
    fetchInfo.mutate(url, {
      onSuccess: (info) => {
        setVideoInfo(info)
        setFetchedUrl(url)
        // Pre-fill creator name from channel if available
        if (info.channel && !creatorName) {
          setCreatorName(info.channel)
        }
      },
      onError: (err) => toast.error(`Failed to fetch info: ${err.message}`)
    })
  }

  const handleDownload = () => {
    if (!fetchedUrl || !creatorName.trim()) {
      toast.error('Please provide a creator name')
      return
    }
    download.mutate(
      { url: fetchedUrl, creatorName: creatorName.trim() },
      {
        onSuccess: (result) => {
          toast.success(`Download queued (${result.downloadId})`)
          setVideoInfo(null)
          setFetchedUrl('')
        },
        onError: (err) => toast.error(`Download failed: ${err.message}`)
      }
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="Downloads"
        description="Fetch video info and download from supported URLs"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New Download</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <UrlInput onSubmit={handleFetchInfo} isLoading={fetchInfo.isPending} />

          {videoInfo && (
            <>
              <Separator />
              <VideoInfoPreview info={videoInfo} />
              <CreatorSelector value={creatorName} onChange={setCreatorName} />
              <Button onClick={handleDownload} disabled={download.isPending || !creatorName.trim()}>
                {download.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Download className="mr-2 size-4" />
                )}
                Download
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active Downloads</CardTitle>
        </CardHeader>
        <CardContent>
          <ActiveDownloadsList />
        </CardContent>
      </Card>
    </PageContainer>
  )
}
