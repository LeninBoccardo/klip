import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAppStore } from '@/hooks/use-app-store'
import { useCancelDownload, useDownloadVideo } from '@/hooks/use-downloads'
import { DownloadProgressCard } from './DownloadProgressCard'
import { URL_INPUT_FOCUS_EVENT } from './UrlInput'
import { ItemGroup } from '@/components/ui/item'
import { Button } from '@ui/button'
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@ui/empty'
import { Download } from 'lucide-react'
import type { DownloadProgress } from '@shared/types'

export function ActiveDownloadsList(): React.ReactElement {
  const { t } = useTranslation('downloads')
  const activeDownloads = useAppStore((s) => s.activeDownloads)
  const removeDownload = useAppStore((s) => s.removeDownload)
  const cancelDownload = useCancelDownload()
  const downloadVideo = useDownloadVideo()
  const entries = Object.values(activeDownloads)

  const handleRetry = (progress: DownloadProgress): void => {
    if (!progress.creatorName) return
    // Drop the failed row immediately so the new download can replace it
    // with its own downloadId. yt-dlp's --continue picks up the partial file
    // by URL+output template, not by downloadId.
    removeDownload(progress.downloadId)
    downloadVideo.mutate(
      { url: progress.url, creatorName: progress.creatorName },
      {
        onError: (err) => toast.error(t('retry.failed', { message: err.message }))
      }
    )
  }

  if (entries.length === 0) {
    return (
      <Empty className="min-h-[120px]">
        <EmptyHeader>
          <EmptyMedia>
            <Download className="size-6 text-muted-foreground" />
          </EmptyMedia>
          <EmptyTitle>{t('active.emptyTitle')}</EmptyTitle>
          <EmptyDescription>{t('active.emptyDescription')}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.dispatchEvent(new CustomEvent(URL_INPUT_FOCUS_EVENT))}
          >
            {t('active.emptyCta')}
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <ItemGroup>
      {entries.map((dl) => (
        <DownloadProgressCard
          key={dl.downloadId}
          progress={dl}
          onCancel={(id) => cancelDownload.mutate(id)}
          onRetry={handleRetry}
          onDismiss={(id) => removeDownload(id)}
        />
      ))}
    </ItemGroup>
  )
}
