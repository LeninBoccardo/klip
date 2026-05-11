import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFetchVideoInfo, useDownloadVideo } from '@/hooks/use-downloads'
import { useAppStore } from '@/hooks/use-app-store'
import { UrlInput } from '@components/features/downloads/UrlInput'
import { VideoInfoPreview } from '@components/features/downloads/VideoInfoPreview'
import { CreatorSelector } from '@components/features/downloads/CreatorSelector'
import { ActiveDownloadsList } from '@components/features/downloads/ActiveDownloadsList'
import { BulkImportDialog } from '@components/features/downloads/BulkImportDialog'
import { PageContainer, PageHeader } from '@/components/shared'
import { Button } from '@ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@ui/card'
import { Separator } from '@ui/separator'
import { Loader2, Download, ListPlus } from 'lucide-react'
import { toast } from 'sonner'
import type { VideoInfo } from '@shared/types'

export const Route = createFileRoute('/downloads')({
  component: DownloadsPage
})

function DownloadsPage(): React.ReactElement {
  const { t } = useTranslation('downloads')
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)
  const [fetchedUrl, setFetchedUrl] = useState('')
  const [creatorName, setCreatorName] = useState('')

  const fetchInfo = useFetchVideoInfo()
  const download = useDownloadVideo()

  const pendingDropUrl = useAppStore((s) => s.pendingDropUrl)
  const setPendingDropUrl = useAppStore((s) => s.setPendingDropUrl)
  const [bulkOpen, setBulkOpen] = useState(false)

  const handleFetchInfo = (url: string): void => {
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
      onError: (err) => toast.error(t('newDownload.fetchInfoFailed', { message: err.message }))
    })
  }

  useEffect(() => {
    if (!pendingDropUrl) return
    const url = pendingDropUrl
    setPendingDropUrl(null)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    handleFetchInfo(url)
    // handleFetchInfo is recreated on every render but only depends on stable
    // references; we intentionally run this effect once per pending URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDropUrl])

  const handleDownload = (): void => {
    if (!fetchedUrl || !creatorName.trim()) {
      toast.error(t('newDownload.needsCreator'))
      return
    }
    download.mutate(
      { url: fetchedUrl, creatorName: creatorName.trim() },
      {
        onSuccess: (result) => {
          toast.success(t('newDownload.queued', { id: result.downloadId }))
          setVideoInfo(null)
          setFetchedUrl('')
        },
        onError: (err) => toast.error(t('newDownload.downloadFailed', { message: err.message }))
      }
    )
  }

  return (
    <PageContainer>
      <PageHeader title={t('page.title')} description={t('page.description')} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t('newDownload.cardTitle')}</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
            <ListPlus className="mr-2 size-4" />
            {t('bulkImport.openButton')}
          </Button>
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
                {t('newDownload.downloadButton')}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('active.cardTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ActiveDownloadsList />
        </CardContent>
      </Card>

      <BulkImportDialog open={bulkOpen} onOpenChange={setBulkOpen} />
    </PageContainer>
  )
}
