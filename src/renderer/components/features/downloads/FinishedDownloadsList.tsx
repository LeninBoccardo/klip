import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@ui/button'
import { Badge } from '@ui/badge'
import { Skeleton } from '@ui/skeleton'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@ui/empty'
import { CheckCircle2, History, RefreshCw, XCircle } from 'lucide-react'
import { useDownloadHistory, useRetryDownload } from '@/hooks/use-download-history'
import { useDateFormat } from '@/hooks/use-date-format'
import type { DownloadHistoryEntryDto } from '@shared/dtos'

/**
 * Renders the persistent ledger of finished download attempts (success +
 * error). Newest first; success rows link to the video page, error rows
 * expose a Retry button when the failure was classified retryable.
 */
export function FinishedDownloadsList(): React.ReactElement {
  const { t } = useTranslation('downloads')
  const { data, isLoading } = useDownloadHistory(50)

  if (isLoading) {
    return <Skeleton className="h-32 w-full" />
  }

  if (!data || data.length === 0) {
    return (
      <Empty className="min-h-[120px]">
        <EmptyHeader>
          <EmptyMedia>
            <History className="size-6 text-muted-foreground" />
          </EmptyMedia>
          <EmptyTitle>{t('finished.emptyTitle')}</EmptyTitle>
          <EmptyDescription>{t('finished.emptyDescription')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="divide-border divide-y">
      {data.map((entry) => (
        <FinishedDownloadRow key={entry.id} entry={entry} />
      ))}
    </div>
  )
}

function FinishedDownloadRow({
  entry
}: {
  entry: DownloadHistoryEntryDto
}): React.ReactElement {
  const { t } = useTranslation('downloads')
  const { formatDate } = useDateFormat()
  const retry = useRetryDownload()

  const handleRetry = (): void => {
    retry.mutate(entry.id, {
      onSuccess: () => toast.success(t('finished.retryQueued')),
      onError: (err) => toast.error(t('finished.retryFailed', { message: err.message }))
    })
  }

  const titleNode = (
    <span className="truncate font-medium text-sm">
      {entry.videoTitle ?? entry.youtubeUrl}
    </span>
  )

  return (
    <div className="flex items-start gap-3 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {entry.status === 'success' ? (
            <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
          ) : (
            <XCircle className="size-4 shrink-0 text-destructive" />
          )}
          {entry.status === 'success' && entry.videoId ? (
            <Link
              to="/videos/$videoId"
              params={{ videoId: entry.videoId }}
              className="min-w-0 truncate text-sm font-medium hover:underline"
            >
              {entry.videoTitle ?? entry.youtubeUrl}
            </Link>
          ) : (
            titleNode
          )}
          {entry.status === 'error' && (
            <Badge variant="destructive" className="text-xs">
              {t('finished.errorBadge')}
            </Badge>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {entry.creatorFolderName && <span>{entry.creatorFolderName}</span>}
          <span>{formatDate(entry.finishedAt)}</span>
        </div>
        {entry.status === 'error' && entry.errorMessage && (
          <p className="mt-1 wrap-break-word text-xs text-muted-foreground">
            {entry.errorMessage}
          </p>
        )}
      </div>
      <div className="shrink-0">
        {entry.status === 'success' && entry.videoId ? (
          <Button asChild variant="outline" size="sm">
            <Link to="/videos/$videoId" params={{ videoId: entry.videoId }}>
              {t('finished.openVideo')}
            </Link>
          </Button>
        ) : entry.status === 'error' && entry.errorRetryable ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRetry}
            disabled={retry.isPending}
          >
            <RefreshCw className="mr-2 size-4" />
            {t('finished.retry')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
