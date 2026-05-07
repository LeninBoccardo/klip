import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
export function EditorView({ sourceVideoId }: { sourceVideoId: string }): React.ReactElement {
  const { t } = useTranslation('editor')
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
    setInPoint(el.currentTime)
  }, [setInPoint])

  const handleMarkOut = useCallback(() => {
    const el = videoRef.current
    if (!el) return
    setOutPoint(el.currentTime)
  }, [setOutPoint])

  const handleSave = useCallback(() => {
    setSaveOpen(true)
  }, [])

  const handleCancelRender = useCallback(async () => {
    if (!activeJobId) return
    await window.api.editorCancelRender(activeJobId)
  }, [activeJobId])

  // ── Editor shortcuts ──
  // I / O capture the playhead into the in/out region — the same mental
  // model as LosslessCut. Mod+Enter opens the save dialog when the
  // timeline is saveable. Esc/Backspace are deliberately NOT bound here:
  // closing a Radix dialog on Esc is handled by the dialog itself, and
  // Esc inside the editor window otherwise has no useful target (no
  // route history to back out of).
  const activeClip = timeline ? getActiveClip(timeline) : null
  const saveable = !!timeline && isTimelineSaveable(timeline)
  useShortcut('i', handleMarkIn)
  useShortcut('o', handleMarkOut)
  useShortcut('mod+enter', () => {
    if (saveable) handleSave()
  })
  const inFlight =
    activeJobStatus === 'queued' ||
    activeJobStatus === 'rendering' ||
    activeJobStatus === 'finalizing'
  const overlayVisible = !!activeJobStatus

  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4 text-sm">
        <span className="font-medium">{t('header.title')}</span>
        <span className="text-muted-foreground">·</span>
        <code className="text-xs text-muted-foreground">{sourceVideoId}</code>
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
