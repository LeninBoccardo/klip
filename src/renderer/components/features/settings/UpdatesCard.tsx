import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { useUpdaterStatus, useCheckForUpdates, useInstallUpdate } from '@/hooks/use-updater'
import { CheckCircle2, Download, RefreshCw, AlertTriangle, Power } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { UpdaterState, UpdaterStatus } from '@shared/types'

const STATE_COPY: Record<UpdaterState, string> = {
  idle: 'Ready to check.',
  checking: 'Checking for updates…',
  available: 'Update available — downloading.',
  downloading: 'Downloading update…',
  ready: 'Update ready to install.',
  'up-to-date': 'You are on the latest version.',
  error: 'Update check failed.',
  disabled: 'Auto-updates run in production builds only.'
}

function StateBadge({ status }: { status: UpdaterStatus }): React.ReactElement {
  switch (status.state) {
    case 'up-to-date':
      return (
        <Badge variant="secondary" className="gap-1">
          <CheckCircle2 className="size-3" />
          Up to date
        </Badge>
      )
    case 'ready':
      return (
        <Badge className="gap-1">
          <Download className="size-3" />
          Ready
        </Badge>
      )
    case 'available':
    case 'downloading':
      return (
        <Badge variant="secondary" className="gap-1">
          <Download className="size-3" />
          {status.state === 'downloading' ? `${status.downloadPercent ?? 0}%` : 'Available'}
        </Badge>
      )
    case 'checking':
      return (
        <Badge variant="secondary" className="gap-1">
          <Spinner className="size-3" />
          Checking
        </Badge>
      )
    case 'error':
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="size-3" />
          Error
        </Badge>
      )
    case 'disabled':
      return (
        <Badge variant="outline" className="gap-1">
          <Power className="size-3" />
          Disabled
        </Badge>
      )
    case 'idle':
    default:
      return <Badge variant="outline">Idle</Badge>
  }
}

export function UpdatesCard(): React.ReactElement | null {
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
          <p className="text-sm text-muted-foreground">Current version</p>
          <p className="text-lg font-medium">v{status.currentVersion}</p>
        </div>
        <StateBadge status={status} />
      </div>

      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">Status</p>
        <p className="text-sm">
          {STATE_COPY[status.state]}
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
          Last checked {formatDistanceToNow(new Date(status.lastCheckedAt), { addSuffix: true })}
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
          Check for updates
        </Button>

        {status.state === 'ready' && (
          <Button onClick={() => installUpdate.mutate()} disabled={installUpdate.isPending}>
            <Power className="mr-2 size-4" />
            Restart and install
          </Button>
        )}
      </div>
    </div>
  )
}
