import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useEnrichAllVideos } from '@/hooks/use-videos'
import { toast } from 'sonner'
import type { EnrichVideosResult } from '@shared/types'
import { useState } from 'react'
import { Sparkles } from 'lucide-react'

export function EnrichVideosButton({ disabled }: { disabled?: boolean }): React.ReactElement {
  const { t } = useTranslation('settings')
  const enrich = useEnrichAllVideos()
  const [result, setResult] = useState<EnrichVideosResult | null>(null)

  const handle = (): void => {
    setResult(null)
    enrich.mutate(undefined, {
      onSuccess: (res) => {
        setResult(res)
        toast.success(t('metadata.successToast', { enriched: res.enriched, total: res.total }))
      },
      onError: (err) => toast.error(t('metadata.failedToast', { message: err.message }))
    })
  }

  return (
    <div className="space-y-3">
      <Button onClick={handle} disabled={disabled || enrich.isPending}>
        {enrich.isPending ? (
          <Spinner className="mr-2 size-4" />
        ) : (
          <Sparkles className="mr-2 size-4" />
        )}
        {t('metadata.runButton')}
      </Button>
      <p className="text-xs text-muted-foreground">{t('metadata.helper')}</p>

      {result && (
        <Card size="sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t('metadata.result.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <Stat label={t('metadata.result.total')} value={result.total} />
              <Stat label={t('metadata.result.enriched')} value={result.enriched} />
              <Stat label={t('metadata.result.failed')} value={result.failed} />
              <Stat label={t('metadata.result.skipped')} value={result.skipped} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}
