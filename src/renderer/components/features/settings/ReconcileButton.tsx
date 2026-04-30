import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ResponsiveGrid } from '@/components/shared/ResponsiveGrid'
import { useReconcile } from '@/hooks/use-reconcile'
import { toast } from 'sonner'
import type { ReconcileResult } from '@shared/types'
import { useState } from 'react'
import { RefreshCw } from 'lucide-react'

type ReconcileStatKey =
  | 'creatorsAdded'
  | 'creatorsMissing'
  | 'creatorsRecovered'
  | 'videosAdded'
  | 'videosMissing'
  | 'videosRecovered'
  | 'cutsAdded'
  | 'cutsMissing'
  | 'cutsRecovered'

export function ReconcileButton({ disabled }: { disabled?: boolean }): React.ReactElement {
  const { t } = useTranslation('settings')
  const reconcile = useReconcile()
  const [result, setResult] = useState<ReconcileResult | null>(null)

  const handleReconcile = (): void => {
    setResult(null)
    reconcile.mutate(undefined, {
      onSuccess: (res) => {
        setResult(res)
        toast.success(t('maintenance.completeToast'))
      },
      onError: (err) => toast.error(t('maintenance.failedToast', { message: err.message }))
    })
  }

  const stats: ReadonlyArray<{ key: ReconcileStatKey; value: number }> = result
    ? [
        { key: 'creatorsAdded', value: result.creatorsAdded },
        { key: 'creatorsMissing', value: result.creatorsMarkedMissing },
        { key: 'creatorsRecovered', value: result.creatorsRecovered },
        { key: 'videosAdded', value: result.videosAdded },
        { key: 'videosMissing', value: result.videosMarkedMissing },
        { key: 'videosRecovered', value: result.videosRecovered },
        { key: 'cutsAdded', value: result.cutsAdded },
        { key: 'cutsMissing', value: result.cutsMarkedMissing },
        { key: 'cutsRecovered', value: result.cutsRecovered }
      ]
    : []

  return (
    <div className="space-y-3">
      <Button onClick={handleReconcile} disabled={disabled || reconcile.isPending}>
        {reconcile.isPending ? (
          <Spinner className="mr-2 size-4" />
        ) : (
          <RefreshCw className="mr-2 size-4" />
        )}
        {t('maintenance.runButton')}
      </Button>

      {result && (
        <Card size="sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t('maintenance.result.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveGrid columns="wide" className="gap-2">
              {stats.map(({ key, value }) => (
                <div key={key} className="text-sm">
                  <p className="text-muted-foreground">
                    {t(`maintenance.result.${key}` as 'maintenance.result.creatorsAdded')}
                  </p>
                  <p className="font-medium">{value}</p>
                </div>
              ))}
            </ResponsiveGrid>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
