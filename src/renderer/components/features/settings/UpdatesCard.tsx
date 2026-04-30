import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { useUpdaterStatus, useCheckForUpdates, useInstallUpdate } from '@/hooks/use-updater'
import { CheckCircle2, Download, RefreshCw, AlertTriangle, Power } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useDateLocale } from '@renderer/i18n/date-locale'
import type { UpdaterStatus } from '@shared/types'

function StateBadge({ status }: { status: UpdaterStatus }): React.ReactElement {
  const { t } = useTranslation('settings')
  switch (status.state) {
    case 'up-to-date':
      return (
        <Badge variant="secondary" className="gap-1">
          <CheckCircle2 className="size-3" />
          {t('updates.badge.upToDate')}
        </Badge>
      )
    case 'ready':
      return (
        <Badge className="gap-1">
          <Download className="size-3" />
          {t('updates.badge.ready')}
        </Badge>
      )
    case 'available':
    case 'downloading':
      return (
        <Badge variant="secondary" className="gap-1">
          <Download className="size-3" />
          {status.state === 'downloading'
            ? `${status.downloadPercent ?? 0}%`
            : t('updates.badge.available')}
        </Badge>
      )
    case 'checking':
      return (
        <Badge variant="secondary" className="gap-1">
          <Spinner className="size-3" />
          {t('updates.badge.checking')}
        </Badge>
      )
    case 'error':
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="size-3" />
          {t('updates.badge.error')}
        </Badge>
      )
    case 'disabled':
      return (
        <Badge variant="outline" className="gap-1">
          <Power className="size-3" />
          {t('updates.badge.disabled')}
        </Badge>
      )
    case 'idle':
    default:
      return <Badge variant="outline">{t('updates.badge.idle')}</Badge>
  }
}

export function UpdatesCard(): React.ReactElement | null {
  const { t } = useTranslation('settings')
  const dateLocale = useDateLocale()
  const { data: status } = useUpdaterStatus()
  const checkForUpdates = useCheckForUpdates()
  const installUpdate = useInstallUpdate()

  if (!status) {
    return null
  }

  const checking = status.state === 'checking' || status.state === 'downloading'
  const disabled = status.state === 'disabled'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{t('updates.currentVersion')}</p>
          <p className="text-lg font-medium">v{status.currentVersion}</p>
        </div>
        <StateBadge status={status} />
      </div>

      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{t('updates.statusLabel')}</p>
        <p className="text-sm">
          {t(`updates.stateCopy.${status.state}` as 'updates.stateCopy.idle')}
          {status.state === 'available' && status.newVersion && (
            <span className="text-muted-foreground"> (v{status.newVersion})</span>
          )}
          {status.state === 'ready' && status.newVersion && (
            <span className="text-muted-foreground"> (v{status.newVersion})</span>
          )}
        </p>
        {status.state === 'downloading' && (
          <Progress value={status.downloadPercent ?? 0} className="mt-2" />
        )}
        {status.state === 'error' && status.errorMessage && (
          <p className="text-sm text-destructive">{status.errorMessage}</p>
        )}
      </div>

      {status.lastCheckedAt && (
        <p className="text-xs text-muted-foreground">
          {t('updates.lastChecked', {
            ago: formatDistanceToNow(new Date(status.lastCheckedAt), {
              addSuffix: true,
              locale: dateLocale
            })
          })}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => checkForUpdates.mutate()}
          disabled={disabled || checking || checkForUpdates.isPending}
          variant="outline"
        >
          {checkForUpdates.isPending ? (
            <Spinner className="mr-2 size-4" />
          ) : (
            <RefreshCw className="mr-2 size-4" />
          )}
          {t('updates.checkButton')}
        </Button>

        {status.state === 'ready' && (
          <Button onClick={() => installUpdate.mutate()} disabled={installUpdate.isPending}>
            <Power className="mr-2 size-4" />
            {t('updates.restartButton')}
          </Button>
        )}
      </div>
    </div>
  )
}
