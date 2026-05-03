import { useTranslation } from 'react-i18next'
import { Item, ItemContent, ItemTitle, ItemDescription, ItemActions } from '@/components/ui/item'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RotateCcw, X } from 'lucide-react'
import type { DownloadProgress } from '@shared/types'

interface DownloadProgressCardProps {
  progress: DownloadProgress
  onCancel: (downloadId: string) => void
  onRetry?: (progress: DownloadProgress) => void
  onDismiss?: (downloadId: string) => void
}

export function DownloadProgressCard({
  progress,
  onCancel,
  onRetry,
  onDismiss
}: DownloadProgressCardProps): React.ReactElement {
  const { t } = useTranslation('downloads')
  const isTerminal =
    progress.status === 'complete' || progress.status === 'error' || progress.status === 'cancelled'
  const showRetry =
    progress.status === 'error' && progress.retriable === true && progress.creatorName

  return (
    <Item variant="outline">
      <ItemContent>
        <ItemTitle>
          {progress.url}
          <Badge
            variant={progress.status === 'error' ? 'destructive' : 'secondary'}
            className="text-xs"
          >
            {progress.status}
          </Badge>
        </ItemTitle>
        <Progress value={progress.percent} className="h-2" />
        <ItemDescription role="status" aria-live="polite" aria-atomic="true">
          {Math.round(progress.percent)}%{progress.speed && ` · ${progress.speed}`}
          {progress.eta && ` · ${t('progress.etaPrefix')} ${progress.eta}`}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        {!isTerminal && (
          <Button variant="ghost" size="icon" onClick={() => onCancel(progress.downloadId)}>
            <X className="size-4" />
          </Button>
        )}
        {showRetry && onRetry && (
          <Button variant="outline" size="sm" onClick={() => onRetry(progress)}>
            <RotateCcw className="mr-2 size-4" />
            {t('retry.button')}
          </Button>
        )}
        {progress.status === 'error' && onDismiss && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDismiss(progress.downloadId)}
            aria-label={t('retry.dismissAria')}
          >
            <X className="size-4" />
          </Button>
        )}
      </ItemActions>
    </Item>
  )
}
