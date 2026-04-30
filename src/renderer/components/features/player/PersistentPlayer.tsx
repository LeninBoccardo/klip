import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { usePlayerStore } from '@/hooks/use-player-store'
import { usePlayerSlot } from './player-slot-ref'
import { mediaUrl } from '@/lib/format'
import { Button } from '@ui/button'
import { Maximize2, X, ExternalLink, SkipBack, SkipForward } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const MINI_WIDTH = 360
const MINI_HEIGHT = 202 // 16:9 from 360px width
const MINI_OFFSET = 24

/**
 * The single, persistent `<video>` element shared across the app.
 *
 * Why one element: the playback-state carry-over between detail and mini
 * mode must preserve buffer, currentTime, decoder state, and audio context.
 * That's only guaranteed if the same DOM node lives across mode changes.
 * The element is portaled to `document.body` so the React tree above it
 * (sidebar, route outlet, etc.) can re-render freely without disturbing it.
 *
 * Position is computed imperatively rather than via CSS classes so the
 * detail-mode overlay can track its placeholder under scroll/resize via
 * `ResizeObserver`. Mini mode uses a fixed corner offset.
 */
export function PersistentPlayer(): React.ReactElement | null {
  const { t } = useTranslation('player')
  const videoId = usePlayerStore((s) => s.videoId)
  const mediaKind = usePlayerStore((s) => s.mediaKind)
  const title = usePlayerStore((s) => s.title)
  const mode = usePlayerStore((s) => s.mode)
  const setMode = usePlayerStore((s) => s.setMode)
  const stop = usePlayerStore((s) => s.stop)
  const reportTime = usePlayerStore((s) => s.reportTime)
  const queue = usePlayerStore((s) => s.queue)
  const next = usePlayerStore((s) => s.next)
  const previous = usePlayerStore((s) => s.previous)

  const slotEl = usePlayerSlot((s) => s.element)
  const videoRef = useRef<HTMLVideoElement>(null)
  // The errored state is keyed off the video id by giving the `<video>` a
  // dynamic `key` below, so we don't need to setState on id change.
  const [erroredId, setErroredId] = useState<string | null>(null)
  const errored = erroredId === videoId
  const navigate = useNavigate()

  // Mounted = the `<video>` is in the tree. Paused / idle stop decoding entirely.
  const mounted = mode === 'detail' || mode === 'mini'

  // Track time → store. Coalesced inside the store to whole seconds.
  useEffect(() => {
    const el = videoRef.current
    if (!el || !mounted) return
    const onTime = (): void => reportTime(el.currentTime)
    el.addEventListener('timeupdate', onTime)
    return () => el.removeEventListener('timeupdate', onTime)
  }, [mounted, reportTime, videoId])

  // Seek to resumeAt on (re)mount or when the videoId changes. We wait for
  // `loadedmetadata` since `currentTime` is a no-op until the duration is
  // known. Subsequent timeupdates from the user shouldn't trigger a re-seek
  // — that's why this runs on videoId/mounted only, not on resumeAt.
  useEffect(() => {
    const el = videoRef.current
    if (!el || !mounted || !videoId) return

    const seekIfNeeded = (): void => {
      const target = usePlayerStore.getState().resumeAt
      if (target > 0 && Math.abs(el.currentTime - target) > 0.5) {
        el.currentTime = target
      }
    }

    if (el.readyState >= 1) seekIfNeeded()
    else el.addEventListener('loadedmetadata', seekIfNeeded, { once: true })
    return () => el.removeEventListener('loadedmetadata', seekIfNeeded)
  }, [videoId, mounted])

  // Position the container.
  // - detail: overlay the slot rect (tracked via ResizeObserver + scroll/resize)
  // - mini:   fixed bottom-right corner
  const containerRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container || !mounted) return

    if (mode === 'mini') {
      container.style.top = `${window.innerHeight - MINI_HEIGHT - MINI_OFFSET}px`
      container.style.left = `${window.innerWidth - MINI_WIDTH - MINI_OFFSET}px`
      container.style.width = `${MINI_WIDTH}px`
      container.style.height = `${MINI_HEIGHT}px`

      const onResize = (): void => {
        container.style.top = `${window.innerHeight - MINI_HEIGHT - MINI_OFFSET}px`
        container.style.left = `${window.innerWidth - MINI_WIDTH - MINI_OFFSET}px`
      }
      window.addEventListener('resize', onResize)
      return () => window.removeEventListener('resize', onResize)
    }

    if (mode === 'detail' && slotEl) {
      const update = (): void => {
        const r = slotEl.getBoundingClientRect()
        container.style.top = `${r.top}px`
        container.style.left = `${r.left}px`
        container.style.width = `${r.width}px`
        container.style.height = `${r.height}px`
      }
      update()
      const ro = new ResizeObserver(update)
      ro.observe(slotEl)
      // Capture phase so scrolls inside nested ScrollAreas still update us.
      window.addEventListener('scroll', update, true)
      window.addEventListener('resize', update)
      return () => {
        ro.disconnect()
        window.removeEventListener('scroll', update, true)
        window.removeEventListener('resize', update)
      }
    }

    // detail mode without a slot: hide the player (the page must be re-mounting).
    container.style.width = '0px'
    container.style.height = '0px'
    return undefined
  }, [mode, slotEl, mounted])

  if (!mounted || !videoId) return null

  const src = mediaUrl(mediaKind, videoId, 'file')

  const handleOpenExternally = async (): Promise<void> => {
    if (!videoId) return
    const result = await window.api.openMediaExternally(mediaKind, videoId)
    if (!result.ok) toast.error(result.error ?? t('openFailed'))
  }

  const handleExpand = (): void => {
    if (!videoId) return
    // Cuts have no dedicated detail route yet — surface them through their
    // parent creator's page. The router-state effect on the creator route
    // will accept a `?cut=…` deep-link in a follow-up.
    if (mediaKind === 'cut') {
      const queueItem = queue?.items[queue.index]
      if (queueItem?.creatorId) {
        navigate({ to: '/creators/$creatorId', params: { creatorId: queueItem.creatorId } })
      }
      setMode('detail')
      return
    }
    navigate({ to: '/videos/$videoId', params: { videoId } })
    setMode('detail')
  }

  /**
   * `onEnded` advances the queue. Reading queue state from the store at the
   * call site (instead of closing over `queue`) avoids a stale snapshot
   * inside the long-lived `<video>` element listener.
   */
  const handleEnded = (): void => {
    const current = usePlayerStore.getState()
    if (!current.queue) return
    next()
  }

  const hasQueue = queue !== null
  const atQueueStart = hasQueue && queue.index === 0
  const atQueueEnd = hasQueue && queue.index >= queue.items.length - 1

  return createPortal(
    <div
      ref={containerRef}
      data-testid="persistent-player"
      data-player-mode={mode}
      className={cn(
        'fixed z-50 overflow-hidden bg-black',
        mode === 'mini' && 'rounded-lg border shadow-2xl ring-1 ring-black/10'
      )}
    >
      {errored ? (
        <UnsupportedFallback onOpenExternally={handleOpenExternally} />
      ) : (
        <video
          ref={videoRef}
          // Force a fresh element when the (kind, id) pair changes so the
          // browser cleanly tears down the old MediaSource and starts the
          // next item in the queue without a state-leak race.
          key={`${mediaKind}:${videoId}`}
          src={src}
          controls={mode === 'detail'}
          autoPlay
          playsInline
          className="h-full w-full bg-black"
          onError={() => setErroredId(videoId)}
          onEnded={handleEnded}
        />
      )}

      {mode === 'mini' && !errored && (
        <MiniOverlay
          title={title}
          showQueueControls={hasQueue}
          atQueueStart={atQueueStart}
          atQueueEnd={atQueueEnd}
          onPrevious={previous}
          onNext={next}
          onExpand={handleExpand}
          onClose={stop}
          onOpenExternally={handleOpenExternally}
        />
      )}
    </div>,
    document.body
  )
}

function MiniOverlay({
  title,
  showQueueControls,
  atQueueStart,
  atQueueEnd,
  onPrevious,
  onNext,
  onExpand,
  onClose,
  onOpenExternally
}: {
  title: string | null
  showQueueControls: boolean
  atQueueStart: boolean
  atQueueEnd: boolean
  onPrevious: () => void
  onNext: () => void
  onExpand: () => void
  onClose: () => void
  onOpenExternally: () => void
}): React.ReactElement {
  const { t } = useTranslation('player')
  return (
    <>
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1 pt-6">
        {showQueueControls && (
          <>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('previousAria')}
              disabled={atQueueStart}
              className="size-6 text-white hover:bg-white/10 hover:text-white"
              onClick={onPrevious}
            >
              <SkipBack className="size-3" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('nextAria')}
              disabled={atQueueEnd}
              className="size-6 text-white hover:bg-white/10 hover:text-white"
              onClick={onNext}
            >
              <SkipForward className="size-3" />
            </Button>
          </>
        )}
        <span className="flex-1 truncate text-xs text-white">{title ?? t('fallbackTitle')}</span>
        <Button
          size="icon"
          variant="ghost"
          aria-label={t('openExternalAria')}
          className="size-6 text-white hover:bg-white/10 hover:text-white"
          onClick={onOpenExternally}
        >
          <ExternalLink className="size-3" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label={t('expandAria')}
          className="size-6 text-white hover:bg-white/10 hover:text-white"
          onClick={onExpand}
        >
          <Maximize2 className="size-3" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label={t('closeAria')}
          className="size-6 text-white hover:bg-white/10 hover:text-white"
          onClick={onClose}
        >
          <X className="size-3" />
        </Button>
      </div>
    </>
  )
}

function UnsupportedFallback({
  onOpenExternally
}: {
  onOpenExternally: () => void
}): React.ReactElement {
  const { t } = useTranslation('player')
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted p-4 text-center text-sm text-muted-foreground">
      <p>{t('unsupported')}</p>
      <Button size="sm" variant="outline" onClick={onOpenExternally}>
        <ExternalLink className="mr-2 size-3" />
        {t('openExternal')}
      </Button>
    </div>
  )
}
