import { useTranslation } from 'react-i18next'
import { useStorageStats } from '@/hooks/use-stats'
import { useSetting } from '@/hooks/use-settings'
import { Button } from '@ui/button'
import { Skeleton } from '@ui/skeleton'
import { ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { formatFileSize } from '@/lib/format'

export function StorageStatsCard(): React.ReactElement {
  const { t } = useTranslation('settings')
  const { data: stats, isLoading } = useStorageStats()
  const { data: rootPath } = useSetting('rootPath')

  const handleOpenInShell = async (): Promise<void> => {
    if (!rootPath) return
    const result = await window.api.openPathInShell(rootPath)
    if (!result.ok) {
      toast.error(result.error ?? t('storage.stats.openFailed'))
    }
  }

  if (isLoading || !stats) {
    return <Skeleton className="h-24 w-full" />
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label={t('storage.stats.videos')} value={formatFileSize(stats.videosBytes)} />
        <Stat label={t('storage.stats.cuts')} value={formatFileSize(stats.cutsBytes)} />
        <Stat
          label={t('storage.stats.total')}
          value={formatFileSize(stats.totalBytes)}
          emphasised
        />
      </div>
      <p className="text-xs text-muted-foreground">{t('storage.stats.note')}</p>
      <Button
        variant="outline"
        size="sm"
        onClick={handleOpenInShell}
        disabled={!rootPath}
      >
        <ExternalLink className="mr-2 size-4" />
        {t('storage.stats.openInShell')}
      </Button>
    </div>
  )
}

function Stat({
  label,
  value,
  emphasised
}: {
  label: string
  value: string
  emphasised?: boolean
}): React.ReactElement {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          emphasised
            ? 'text-base font-semibold tabular-nums'
            : 'text-sm font-medium tabular-nums'
        }
      >
        {value}
      </p>
    </div>
  )
}
