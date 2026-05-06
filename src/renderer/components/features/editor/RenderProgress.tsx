import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Button } from '@ui/button'
import { Progress } from '@ui/progress'
import type { RenderJobStatus } from '@shared/types'

interface RenderProgressProps {
  status: RenderJobStatus
  /** 0–100, or null while ffmpeg is still pre-rolling. */
  percent: number | null
  errorMessage: string | null
  onCancel: () => void
  onDismiss: () => void
}

/**
 * Full-bleed progress overlay for the editor window. Mounted absolutely
 * over the preview/timeline while a render is in flight; switches to a
 * terminal "complete / cancelled / error" state once the queue resolves
 * and stays visible until dismissed (the user reads the outcome before
 * starting the next render).
 *
 * The status mirror is owned by the editor store, fed by the
 * `render-progress` push channel; this component is purely presentational.
 */
export function RenderProgress({
  status,
  percent,
  errorMessage,
  onCancel,
  onDismiss
}: RenderProgressProps): React.ReactElement {
  const { t } = useTranslation('editor')
  const inFlight = status === 'queued' || status === 'rendering' || status === 'finalizing'
  const headline = headlineFor(status, t)
  const sub = subFor(status, percent, errorMessage, t)

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background/85 backdrop-blur-sm">
      <div className="flex w-full max-w-md flex-col gap-3 rounded-lg border bg-background p-6 shadow-lg">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">{headline}</span>
          <span className="text-xs text-muted-foreground">{sub}</span>
        </div>
        {inFlight && (
          <Progress
            value={percent ?? 0}
            // Indeterminate-looking bar when ffmpeg is pre-rolling; the
            // store sends `null` until the first `out_time_us` arrives.
            className={percent === null ? 'animate-pulse' : ''}
          />
        )}
        <div className="flex justify-end gap-2">
          {inFlight ? (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              {t('progress.actions.cancel')}
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              {t('progress.actions.dismiss')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function headlineFor(status: RenderJobStatus, t: TFunction<'editor'>): string {
  switch (status) {
    case 'queued':
      return t('progress.headline.queued')
    case 'rendering':
      return t('progress.headline.rendering')
    case 'finalizing':
      return t('progress.headline.finalizing')
    case 'complete':
      return t('progress.headline.complete')
    case 'cancelled':
      return t('progress.headline.cancelled')
    case 'error':
      return t('progress.headline.error')
  }
}

function subFor(
  status: RenderJobStatus,
  percent: number | null,
  errorMessage: string | null,
  t: TFunction<'editor'>
): string {
  if (status === 'rendering' && percent !== null) {
    return t('progress.sub.renderingPercent', { percent: percent.toFixed(0) })
  }
  if (status === 'rendering') return t('progress.sub.renderingPreroll')
  if (status === 'queued') return t('progress.sub.queued')
  if (status === 'finalizing') return t('progress.sub.finalizing')
  if (status === 'complete') return t('progress.sub.complete')
  if (status === 'cancelled') return t('progress.sub.cancelled')
  if (status === 'error') return errorMessage ?? t('progress.sub.errorFallback')
  return ''
}
