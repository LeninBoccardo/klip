import { useTranslation } from 'react-i18next'
import { Item, ItemContent, ItemTitle, ItemDescription, ItemActions } from '@/components/ui/item'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { X } from 'lucide-react'
import type { DownloadProgress } from '@shared/types'

interface DownloadProgressCardProps {
  progress: DownloadProgress
  onCancel: (downloadId: string) => void
}

export function DownloadProgressCard({
  progress,
  onCancel
}: DownloadProgressCardProps): React.ReactElement {
  const { t } = useTranslation('downloads')
  const isTerminal =
    progress.status === 'complete' || progress.status === 'error' || progress.status === 'cancelled'

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
        <ItemDescription>
          {Math.round(progress.percent)}%{progress.speed && ` · ${progress.speed}`}
          {progress.eta && ` · ${t('progress.etaPrefix')} ${progress.eta}`}
        </ItemDescription>
      </ItemContent>
      {!isTerminal && (
        <ItemActions>
          <Button variant="ghost" size="icon" onClick={() => onCancel(progress.downloadId)}>
            <X className="size-4" />
          </Button>
        </ItemActions>
      )}
    </Item>
  )
}
