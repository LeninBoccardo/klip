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
  const inFlight = status === 'queued' || status === 'rendering' || status === 'finalizing'
  const headline = headlineFor(status)
  const sub = subFor(status, percent, errorMessage)

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
              Cancel
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function headlineFor(status: RenderJobStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued…'
    case 'rendering':
      return 'Rendering…'
    case 'finalizing':
      return 'Finalising…'
    case 'complete':
      return 'Cut saved'
    case 'cancelled':
      return 'Render cancelled'
    case 'error':
      return 'Render failed'
  }
}

function subFor(
  status: RenderJobStatus,
  percent: number | null,
  errorMessage: string | null
): string {
  if (status === 'rendering' && percent !== null) {
    return `${percent.toFixed(0)}%`
  }
  if (status === 'rendering') return 'Pre-rolling…'
  if (status === 'queued') return 'Waiting for the render queue.'
  if (status === 'finalizing') return 'Writing output and metadata.'
  if (status === 'complete') return 'The cut is now in your library.'
  if (status === 'cancelled') return 'Partial output cleaned up.'
  if (status === 'error') return errorMessage ?? 'See the log for details.'
  return ''
}
