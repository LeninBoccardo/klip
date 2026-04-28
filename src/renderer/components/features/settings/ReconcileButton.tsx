import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ResponsiveGrid } from '@/components/shared/ResponsiveGrid'
import { useReconcile } from '@/hooks/use-reconcile'
import { toast } from 'sonner'
import type { ReconcileResult } from '@shared/types'
import { useState } from 'react'
import { RefreshCw } from 'lucide-react'

export function ReconcileButton({ disabled }: { disabled?: boolean }): React.ReactElement {
  const reconcile = useReconcile()
  const [result, setResult] = useState<ReconcileResult | null>(null)

  const handleReconcile = (): void => {
    setResult(null)
    reconcile.mutate(undefined, {
      onSuccess: (res) => {
        setResult(res)
        toast.success('Reconciliation complete')
      },
      onError: (err) => toast.error(`Reconciliation failed: ${err.message}`)
    })
  }

  return (
    <div className="space-y-3">
      <Button onClick={handleReconcile} disabled={disabled || reconcile.isPending}>
        {reconcile.isPending ? (
          <Spinner className="mr-2 size-4" />
        ) : (
          <RefreshCw className="mr-2 size-4" />
        )}
        Run Reconciliation
      </Button>

      {result && (
        <Card size="sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Reconciliation Result</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveGrid columns="wide" className="gap-2">
              {(
                [
                  ['Creators added', result.creatorsAdded],
                  ['Creators missing', result.creatorsMarkedMissing],
                  ['Creators recovered', result.creatorsRecovered],
                  ['Videos added', result.videosAdded],
                  ['Videos missing', result.videosMarkedMissing],
                  ['Videos recovered', result.videosRecovered],
                  ['Cuts added', result.cutsAdded],
                  ['Cuts missing', result.cutsMarkedMissing],
                  ['Cuts recovered', result.cutsRecovered]
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="text-sm">
                  <p className="text-muted-foreground">{label}</p>
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
