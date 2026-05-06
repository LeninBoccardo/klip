import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Scissors, X } from 'lucide-react'
import { Button } from '@ui/button'
import { Progress } from '@ui/progress'
import type { RenderProgress } from '@shared/types'

/**
 * Compact main-window indicator for an in-flight editor render.
 * Mounted in the sidebar footer; visible only while the most recent
 * `render-progress` event is non-terminal. Clicking the chip refocuses
 * (or reopens) the editor window for the current source video.
 *
 * Self-contained — keeps its own listener + tiny state slice rather
 * than reaching into `useEditorStore`. The editor store is for the
 * editor window; the main window doesn't need timeline / source state,
 * just the latest job snapshot.
 *
 * Terminal events (complete / cancelled / error) are kept on screen for
 * a few seconds so the user sees the outcome before the chip fades. A
 * fresh `queued` event from a subsequent render replaces the snapshot
 * immediately — no stacking of dismiss timers.
 */
export function RenderProgressChip(): React.ReactElement | null {
  const { t } = useTranslation('editor')
  const [snapshot, setSnapshot] = useState<RenderProgress | null>(null)

  useEffect(() => {
    const unsubscribe = window.api.onRenderProgress((_event, data) => {
      setSnapshot(data)
    })
    return unsubscribe
  }, [])

  // Fade out the chip a few seconds after a terminal event so the
  // sidebar doesn't gain a permanent "Cut saved" line.
  useEffect(() => {
    if (!snapshot) return
    if (
      snapshot.status === 'complete' ||
      snapshot.status === 'cancelled' ||
      snapshot.status === 'error'
    ) {
      const id = window.setTimeout(() => setSnapshot(null), 4000)
      return () => window.clearTimeout(id)
    }
    return
  }, [snapshot])

  if (!snapshot) return null

  const inFlight =
    snapshot.status === 'queued' ||
    snapshot.status === 'rendering' ||
    snapshot.status === 'finalizing'

  const handleClick = async (): Promise<void> => {
    await window.api.editorOpenWindow({ sourceVideoId: snapshot.sourceVideoId })
  }

  const handleDismiss = (): void => setSnapshot(null)

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full flex-col gap-1.5 rounded-md border bg-muted/40 px-3 py-2 text-left text-xs transition-colors hover:bg-muted"
      aria-label={t('chip.reopenAria')}
    >
      <div className="flex items-center gap-2">
        <Scissors className="size-3.5 text-primary" />
        <span className="flex-1 truncate font-medium">{labelFor(snapshot, t)}</span>
        {!inFlight && (
          <Button
            asChild
            size="icon"
            variant="ghost"
            className="size-5"
            onClick={(e) => {
              e.stopPropagation()
              handleDismiss()
            }}
          >
            <span aria-label={t('chip.dismissAria')}>
              <X className="size-3" />
            </span>
          </Button>
        )}
      </div>
      {inFlight && (
        <Progress
          value={snapshot.percent ?? 0}
          className={snapshot.percent === null ? 'h-1.5 animate-pulse' : 'h-1.5'}
        />
      )}
    </button>
  )
}

function labelFor(p: RenderProgress, t: TFunction<'editor'>): string {
  switch (p.status) {
    case 'queued':
      return t('chip.queued')
    case 'rendering':
      return p.percent !== null
        ? t('chip.renderingPercent', { percent: p.percent.toFixed(0) })
        : t('chip.rendering')
    case 'finalizing':
      return t('chip.finalizing')
    case 'complete':
      return t('chip.complete')
    case 'cancelled':
      return t('chip.cancelled')
    case 'error':
      return t('chip.error')
  }
}
