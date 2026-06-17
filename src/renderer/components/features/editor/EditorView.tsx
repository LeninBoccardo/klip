import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@ui/tooltip'
import { Kbd } from '@ui/kbd'
import { mediaUrl } from '@/lib/format'
import { useEditorStore } from '@/hooks/use-editor-store'
import { useShortcut } from '@/hooks/use-shortcut'
import { getActiveClip, isTimelineSaveable } from '@/lib/recipe-from-timeline'
import { Timeline } from './Timeline'
import { SaveCutDialog } from './SaveCutDialog'
import { RenderProgress } from './RenderProgress'

/**
 * The editor window's main view. Layout is straightforward:
 *
 *   ┌─ header ─────────────────────────────────────────┐
 *   │ Editor · <source-id>                             │
 *   ├──────────────────────────────────────────────────┤
 *   │                                                  │
 *   │     <video> preview (16:9, click-to-toggle)      │
 *   │                                                  │
 *   ├──────────────────────────────────────────────────┤
 *   │ ⏯ time / duration   [I] [O] [⌫ clear]   [Save…] │
 *   ├──────────────────────────────────────────────────┤
 *   │ Timeline ░░░░░░█████░░░░░░░░░░░░░░░░░░░░░░░░░░░│
 *   └──────────────────────────────────────────────────┘
 *
 * The `<video>` element is mounted directly here (NOT the
 * PersistentPlayer) — the editor window is a separate Electron
 * window so the singleton player from the main window is unreachable.
 * Range scrubbing works because the klip-media:// handler delegates
 * to `net.fetch(file://)`, which honours Range natively.
 */
// Fallback frame-step delta when the source frame rate is unknown (probe
// pending or no video stream). 1/30s is the right magnitude for "nudge by one
// frame"; when ffprobe gives us the real rate we use 1/fps instead (F71).
const FALLBACK_FRAME_DURATION_SEC = 1 / 30

export function EditorView({ sourceVideoId }: { sourceVideoId: string }): React.ReactElement {
  const { t } = useTranslation('editor')
  const sourceTitle = useEditorStore((s) => s.sourceTitle)
  const sourceCreatorName = useEditorStore((s) => s.sourceCreatorName)
  const sourceFrameRate = useEditorStore((s) => s.sourceFrameRate)
  const timeline = useEditorStore((s) => s.timeline)
  const setCursor = useEditorStore((s) => s.setCursor)
  const setInPoint = useEditorStore((s) => s.setInPoint)
  const setOutPoint = useEditorStore((s) => s.setOutPoint)
  const clearRegion = useEditorStore((s) => s.clearRegion)
  const activeJobId = useEditorStore((s) => s.activeJobId)
  const activeJobStatus = useEditorStore((s) => s.activeJobStatus)
  const activeJobPercent = useEditorStore((s) => s.activeJobPercent)
  const activeJobError = useEditorStore((s) => s.activeJobError)
  const clearJob = useEditorStore((s) => s.clearJob)

  const videoRef = useRef<HTMLVideoElement>(null)
  const [saveOpen, setSaveOpen] = useState(false)

  // ── Mirror the <video> currentTime into the store ──
  // Using `timeupdate` (default ~4 Hz) keeps the cursor smooth without
  // overflowing zustand updates per second. The cursor is what
  // `Mark in / Mark out` reads, so this loop is the single source of
  // truth for "where the playhead is".
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const onTimeUpdate = (): void => setCursor(el.currentTime)
    el.addEventListener('timeupdate', onTimeUpdate)
    return () => el.removeEventListener('timeupdate', onTimeUpdate)
  }, [setCursor])

  // External seeks (timeline click, keyboard shortcuts in phase 9) write
  // to the store; mirror back to the <video> so the preview follows.
  useEffect(() => {
    if (!timeline) return
    const el = videoRef.current
    if (!el) return
    const next = timeline.cursorSec
    if (Math.abs(el.currentTime - next) > 0.05) {
      el.currentTime = next
    }
  }, [timeline])

  const handleMarkIn = useCallback(() => {
    const el = videoRef.current
    if (!el) return
    // A refused mark would otherwise be a silent no-op (the store only
    // console.warns) — both the I shortcut and the Mark In button funnel here,
    // so surface why nothing changed instead of feeling broken (F76).
    if (!setInPoint(el.currentTime)) toast.error(t('controls.invalidRegion'))
  }, [setInPoint, t])

  const handleMarkOut = useCallback(() => {
    const el = videoRef.current
    if (!el) return
    if (!setOutPoint(el.currentTime)) toast.error(t('controls.invalidRegion'))
  }, [setOutPoint, t])

  const handleSave = useCallback(() => {
    setSaveOpen(true)
  }, [])

  const handleCancelRender = useCallback(async () => {
    if (!activeJobId) return
    await window.api.editorCancelRender(activeJobId)
  }, [activeJobId])

  // Shared seek helper for frame-step + arrow shortcuts. Mirrors into the
  // store immediately so the timeline cursor jumps without waiting for the
  // next `timeupdate` (which lands ~250ms later — long enough to feel laggy
  // during keyboard scrubbing). The store→video effect higher up will
  // no-op on the round-trip because the values match within its 0.05s
  // threshold.
  const seekRelative = useCallback(
    (deltaSec: number): void => {
      const el = videoRef.current
      if (!el) return
      const max = Number.isFinite(el.duration) ? el.duration : Infinity
      const next = Math.min(Math.max(el.currentTime + deltaSec, 0), max)
      el.currentTime = next
      setCursor(next)
    },
    [setCursor]
  )

  // One frame in seconds for the comma/period nudge: 1/fps from the probed
  // source rate, or the 1/30s fallback when the rate is unknown. Guards against
  // a non-positive/non-finite rate so a bad probe can't produce a 0 or NaN step.
  const frameDurationSec =
    sourceFrameRate && sourceFrameRate > 0 ? 1 / sourceFrameRate : FALLBACK_FRAME_DURATION_SEC

  const handleFrameStepBack = useCallback(() => {
    seekRelative(-frameDurationSec)
  }, [seekRelative, frameDurationSec])
  const handleFrameStepForward = useCallback(() => {
    seekRelative(frameDurationSec)
  }, [seekRelative, frameDurationSec])
  const handleArrowLeft = useCallback(
    (e: KeyboardEvent) => {
      seekRelative(e.shiftKey ? -5 : -1)
    },
    [seekRelative]
  )
  const handleArrowRight = useCallback(
    (e: KeyboardEvent) => {
      seekRelative(e.shiftKey ? 5 : 1)
    },
    [seekRelative]
  )

  // ── Editor shortcuts ──
  // I / O capture the playhead into the in/out region — same mental model
  // as LosslessCut. Mod+Enter opens the save dialog when the timeline is
  // saveable. Arrow keys read shiftKey at fire time so a single binding
  // covers ±1s and ±5s without double-firing (single-key shortcuts in
  // useShortcut don't filter shift). Esc closes the editor window, but is
  // disabled while the save dialog is open so Radix's native Esc-to-close
  // dialog handling wins.
  const activeClip = timeline ? getActiveClip(timeline) : null
  const saveable = !!timeline && isTimelineSaveable(timeline)
  // Gate scrub/mark shortcuts while the Save dialog is open. useShortcut only
  // suppresses single-key shortcuts when focus is in a text input, but the
  // dialog has non-text focus targets (radio group, buttons) — without this,
  // tabbing to a button then pressing i/o/arrows would silently re-mark or
  // scrub the timeline hidden behind the modal, changing what gets rendered. (F26)
  const editorShortcutsEnabled = !saveOpen
  useShortcut('i', handleMarkIn, { enabled: editorShortcutsEnabled })
  useShortcut('o', handleMarkOut, { enabled: editorShortcutsEnabled })
  useShortcut(',', handleFrameStepBack, { enabled: editorShortcutsEnabled })
  useShortcut('.', handleFrameStepForward, { enabled: editorShortcutsEnabled })
  useShortcut('arrowleft', handleArrowLeft, { enabled: editorShortcutsEnabled })
  useShortcut('arrowright', handleArrowRight, { enabled: editorShortcutsEnabled })
  useShortcut('mod+enter', () => {
    if (saveable) handleSave()
  })
  useShortcut(
    'escape',
    () => {
      window.close()
    },
    { enabled: !saveOpen }
  )
  const inFlight =
    activeJobStatus === 'queued' ||
    activeJobStatus === 'rendering' ||
    activeJobStatus === 'finalizing'
  const overlayVisible = !!activeJobStatus

  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4 text-sm">
        <span className="shrink-0 font-medium">{t('header.title')}</span>
        <span className="shrink-0 text-muted-foreground">·</span>
        <span className="min-w-0 truncate font-medium" title={sourceVideoId}>
          {sourceTitle ?? sourceVideoId}
        </span>
        {sourceCreatorName && (
          <>
            <span className="shrink-0 text-muted-foreground">—</span>
            <span className="min-w-0 truncate text-muted-foreground">{sourceCreatorName}</span>
          </>
        )}
      </header>

      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Preview pane — flex-1 so it eats the available height. */}
        <div className="relative flex flex-1 items-center justify-center bg-black">
          {timeline ? (
            <video
              ref={videoRef}
              src={mediaUrl('video', sourceVideoId, 'file')}
              controls
              className="h-full w-full"
              preload="metadata"
              aria-label={t('preview.aria')}
            />
          ) : (
            <span className="text-sm text-muted-foreground">{t('loading')}</span>
          )}
        </div>

        {/* Controls + timeline. Pinned to the bottom of the editor. */}
        {timeline && activeClip && (
          <div className="flex shrink-0 flex-col gap-3 border-t bg-background p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono text-xs text-muted-foreground">
                {formatSeconds(timeline.cursorSec)} / {formatSeconds(activeClip.durationSec)}
              </span>
              <span className="ml-2 flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="outline" onClick={handleMarkIn}>
                      {t('controls.markIn')} <Kbd className="ml-2">I</Kbd>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('controls.markIn')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="outline" onClick={handleMarkOut}>
                      {t('controls.markOut')} <Kbd className="ml-2">O</Kbd>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('controls.markOut')}</TooltipContent>
                </Tooltip>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearRegion}
                  disabled={!activeClip.region}
                >
                  {t('controls.clearRegion')}
                </Button>
              </span>
              <span className="ml-auto flex items-center gap-2">
                {activeClip.region && (
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatSeconds(activeClip.region.inSec)} →{' '}
                    {formatSeconds(activeClip.region.outSec)}
                  </span>
                )}
                <Button size="sm" onClick={handleSave} disabled={!saveable || inFlight}>
                  {t('controls.save')}
                </Button>
              </span>
            </div>

            <Timeline state={timeline} onSeek={setCursor} />
          </div>
        )}

        {overlayVisible && activeJobStatus && (
          <RenderProgress
            status={activeJobStatus}
            percent={activeJobPercent}
            errorMessage={activeJobError}
            onCancel={handleCancelRender}
            onDismiss={clearJob}
          />
        )}
      </div>

      <SaveCutDialog open={saveOpen} onOpenChange={setSaveOpen} />
    </div>
  )
}

function formatSeconds(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '00:00.000'
  const totalMs = Math.floor(s * 1000)
  const ms = totalMs % 1000
  const totalSec = Math.floor(totalMs / 1000)
  const sec = totalSec % 60
  const totalMin = Math.floor(totalSec / 60)
  const min = totalMin % 60
  const hour = Math.floor(totalMin / 60)
  const pad = (n: number, width = 2): string => n.toString().padStart(width, '0')
  return hour > 0
    ? `${pad(hour)}:${pad(min)}:${pad(sec)}.${pad(ms, 3)}`
    : `${pad(min)}:${pad(sec)}.${pad(ms, 3)}`
}
