import { useCallback, useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'
import { ThumbnailStrip } from './ThumbnailStrip'
import type { TimelineState } from '@/lib/recipe-from-timeline'
import { getActiveClip } from '@/lib/recipe-from-timeline'

interface TimelineProps {
  state: TimelineState
  /** Called when the user clicks the track to seek. Receives seconds. */
  onSeek: (sec: number) => void
}

/**
 * Hand-rolled single-track timeline (plan §4 Option 1). Thin wrapper
 * around the graph-shaped state in the editor store — pure layout +
 * a click-to-seek handler. No drag-and-drop in MVP; in/out points are
 * set by the I/O buttons in EditorView (which capture the current
 * playhead).
 *
 * Visual layers, bottom to top:
 *   1. ThumbnailStrip — dimmed source poster as a backdrop.
 *   2. Region — colored band between in and out, only when both set.
 *   3. Cursor — vertical line at the current playhead.
 */
export function Timeline({ state, onSeek }: TimelineProps): React.ReactElement | null {
  const trackRef = useRef<HTMLDivElement>(null)
  const clip = getActiveClip(state)
  const duration = clip?.durationSec ?? 0
  const region = clip?.region ?? null

  const cursorPct = duration > 0 ? clamp01(state.cursorSec / duration) * 100 : 0
  const regionStyle = useMemo(() => {
    if (!region || duration <= 0) return null
    const inPct = clamp01(region.inSec / duration) * 100
    const outPct = clamp01(region.outSec / duration) * 100
    return { left: `${inPct}%`, width: `${Math.max(0, outPct - inPct)}%` }
  }, [region, duration])

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = trackRef.current
      if (!el || duration <= 0) return
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0) return
      const pct = clamp01((e.clientX - rect.left) / rect.width)
      onSeek(pct * duration)
    },
    [duration, onSeek]
  )

  if (!clip) return null

  return (
    <div className="flex flex-col gap-1">
      <div
        ref={trackRef}
        role="slider"
        aria-label="Timeline"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={state.cursorSec}
        tabIndex={0}
        onClick={handleClick}
        className={cn(
          'relative h-16 w-full cursor-crosshair overflow-hidden rounded border bg-muted',
          'focus-visible:outline-2 focus-visible:outline-ring'
        )}
      >
        <ThumbnailStrip sourceVideoId={clip.sourceVideoId} />

        {regionStyle && (
          <div
            aria-hidden
            className="absolute top-0 h-full bg-primary/30 ring-1 ring-inset ring-primary"
            style={regionStyle}
          />
        )}

        <div
          aria-hidden
          className="pointer-events-none absolute top-0 h-full w-0.5 -translate-x-1/2 bg-foreground"
          style={{ left: `${cursorPct}%` }}
        />
      </div>
    </div>
  )
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}
