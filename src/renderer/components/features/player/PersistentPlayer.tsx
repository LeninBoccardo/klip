import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { draggable } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { useSetting, useSetSetting } from '@/hooks/use-settings'
import { usePlayerStore } from '@/hooks/use-player-store'
import { usePlayerSlot } from './player-slot-ref'
import { mediaUrl } from '@/lib/format'
import { useShortcut } from '@/hooks/use-shortcut'
import { Button } from '@ui/button'
import { GripHorizontal, Maximize2, X, ExternalLink, SkipBack, SkipForward } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  DEFAULT_MINI_PLAYER_CORNER,
  SETTING_KEYS,
  isMiniPlayerCorner,
  type MiniPlayerCorner
} from '@shared/types'

const MINI_WIDTH = 360
const MINI_HEIGHT = 202 // 16:9 from 360px width
const MINI_OFFSET = 24

/**
 * Convert a corner anchor + window dimensions into absolute pixel offsets
 * for the mini player container. Keeps the math in one place so the
 * initial mount, the resize listener, and the post-drop animation all
 * agree on the same numbers.
 */
function cornerToPosition(corner: MiniPlayerCorner): { top: number; left: number } {
  const w = window.innerWidth
  const h = window.innerHeight
  const right = w - MINI_WIDTH - MINI_OFFSET
  const bottom = h - MINI_HEIGHT - MINI_OFFSET
  switch (corner) {
    case 'TL':
      return { top: MINI_OFFSET, left: MINI_OFFSET }
    case 'TR':
      return { top: MINI_OFFSET, left: right }
    case 'BL':
      return { top: bottom, left: MINI_OFFSET }
    case 'BR':
      return { top: bottom, left: right }
  }
}

/**
 * Pick the nearest corner for a given on-screen center point. Used after a
 * drag-and-drop release so the player snaps deterministically — the user
 * doesn't have to land in an exact zone, just somewhere closer to the
 * intended corner than to any other.
 */
function nearestCorner(centerX: number, centerY: number): MiniPlayerCorner {
  const left = centerX < window.innerWidth / 2
  const top = centerY < window.innerHeight / 2
  if (top && left) return 'TL'
  if (top && !left) return 'TR'
  if (!top && left) return 'BL'
  return 'BR'
}

function seekToPercent(el: HTMLVideoElement, fraction: number): void {
  if (!Number.isFinite(el.duration) || el.duration <= 0) return
  el.currentTime = el.duration * fraction
}

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
  const seekRequest = usePlayerStore((s) => s.seekRequest)

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

  // External seek requests (e.g. clicking a transcript line). Keyed off the
  // request's `nonce` so consecutive seeks to the same timestamp still fire.
  // Defers to `loadedmetadata` if the surface hasn't decoded enough to set
  // `currentTime` yet — without that guard, a click immediately after the
  // route mounts would be a no-op.
  useEffect(() => {
    const el = videoRef.current
    if (!el || !mounted || !seekRequest) return
    const target = Math.max(0, seekRequest.seconds)

    const apply = (): void => {
      el.currentTime = target
      // Resume playback if the user was paused — clicking a line implies
      // "start from here".
      if (el.paused) void el.play().catch(() => {})
    }

    if (el.readyState >= 1) apply()
    else el.addEventListener('loadedmetadata', apply, { once: true })
    return () => el.removeEventListener('loadedmetadata', apply)
  }, [seekRequest, mounted])

  // Persisted corner anchor for the mini player. Reads from settings; falls
  // back to the previous hardcoded bottom-right when nothing is stored yet.
  const cornerSetting = useSetting(SETTING_KEYS.miniPlayerCorner)
  const persistCorner = useSetSetting()
  const corner: MiniPlayerCorner = isMiniPlayerCorner(cornerSetting.data)
    ? cornerSetting.data
    : DEFAULT_MINI_PLAYER_CORNER

  // Position the container.
  // - detail: overlay the slot rect (tracked via ResizeObserver + scroll/resize)
  // - mini:   snap to one of four corners; the choice is persisted across sessions.
  const containerRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container || !mounted) return

    if (mode === 'mini') {
      const apply = (): void => {
        const { top, left } = cornerToPosition(corner)
        container.style.top = `${top}px`
        container.style.left = `${left}px`
        container.style.width = `${MINI_WIDTH}px`
        container.style.height = `${MINI_HEIGHT}px`
      }
      apply()

      const onResize = (): void => apply()
      window.addEventListener('resize', onResize)
      return () => window.removeEventListener('resize', onResize)
    }

    if (mode === 'detail' && slotEl) {
      // Track only the values we've actually applied, so the rAF loop
      // below can early-out when nothing changed. Without this, every
      // animation frame would assign four style properties even when the
      // slot is perfectly still — wasteful and triggers needless style
      // recomputation.
      let lastTop = NaN
      let lastLeft = NaN
      let lastWidth = NaN
      let lastHeight = NaN
      const update = (): void => {
        const r = slotEl.getBoundingClientRect()
        if (
          r.top !== lastTop ||
          r.left !== lastLeft ||
          r.width !== lastWidth ||
          r.height !== lastHeight
        ) {
          lastTop = r.top
          lastLeft = r.left
          lastWidth = r.width
          lastHeight = r.height
          container.style.top = `${r.top}px`
          container.style.left = `${r.left}px`
          container.style.width = `${r.width}px`
          container.style.height = `${r.height}px`
        }
      }
      update()

      // Why a rAF loop instead of scroll/resize listeners:
      //
      // The page scrolls inside Radix ScrollArea's viewport. Earlier
      // attempts to listen on `window` (capture phase) and to walk the
      // ancestor chain and attach `scroll` listeners on every scrollable
      // parent both still left the player visibly stationary while the
      // content scrolled underneath. (Logs confirmed the listeners were
      // installed; the actual scroll signal didn't reliably propagate to
      // them — radix's viewport implementation has bitten us here before.)
      //
      // The rAF approach sidesteps the question entirely: we just read
      // the slot's `getBoundingClientRect()` every frame and reposition
      // when it changes. It's a few floating-point reads per frame and a
      // string-template assignment only on actual change, so the perf
      // cost is invisible compared to video decoding happening anyway.
      // It naturally covers every motion source — scroll, resize, layout
      // shift, sidebar toggle — without needing to enumerate them.
      // Pause the loop while the window is hidden (minimized / occluded /
      // backgrounded): there's no layout to track and no point burning a
      // getBoundingClientRect per frame, and it lets the renderer idle so the
      // OS can throttle. Resume on visibility. (F45/F46)
      let rafId = 0
      const startLoop = (): void => {
        if (rafId) return
        rafId = requestAnimationFrame(function tick() {
          update()
          rafId = requestAnimationFrame(tick)
        })
      }
      const stopLoop = (): void => {
        if (rafId) cancelAnimationFrame(rafId)
        rafId = 0
      }
      const onVisibility = (): void => {
        if (document.hidden) stopLoop()
        else {
          update()
          startLoop()
        }
      }
      if (!document.hidden) startLoop()
      document.addEventListener('visibilitychange', onVisibility)

      // ResizeObserver is still useful: it fires synchronously after a
      // resize-driven layout, eliminating the up-to-one-frame lag the rAF
      // loop would otherwise introduce on window-resize.
      const ro = new ResizeObserver(update)
      ro.observe(slotEl)

      return () => {
        stopLoop()
        document.removeEventListener('visibilitychange', onVisibility)
        ro.disconnect()
      }
    }

    // detail mode without a slot: hide the player (the page must be re-mounting).
    container.style.width = '0px'
    container.style.height = '0px'
    return undefined
  }, [mode, slotEl, mounted, corner])

  // ── Wheel forwarding ──────────────────────────────────────────────────
  //
  // The player container is portaled to `document.body` and floats above
  // everything with `position: fixed z-70`. Wheel events that fire on the
  // video element bubble up to body — they NEVER reach the page's Radix
  // ScrollArea viewport (which is inside the React tree under the route
  // outlet). Result: hovering the player paralyses page scrolling.
  //
  // Fix: intercept wheel on the container, briefly disable its own
  // `pointer-events` so `document.elementFromPoint` returns whatever sits
  // underneath in the actual page DOM, then walk that ancestry to find
  // the first vertically-scrollable element and scroll it directly. This
  // handles both the page-level ScrollArea (PageContainer) and any
  // nested ScrollArea (e.g. the transcript list under the mini player).
  useEffect(() => {
    const container = containerRef.current
    if (!container || !mounted) return

    const handleWheel = (e: WheelEvent): void => {
      const prev = container.style.pointerEvents
      container.style.pointerEvents = 'none'
      const below = document.elementFromPoint(e.clientX, e.clientY)
      container.style.pointerEvents = prev

      let node = below as HTMLElement | null
      while (node && node !== document.body) {
        const style = getComputedStyle(node)
        const canScroll =
          (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
          node.scrollHeight > node.clientHeight
        if (canScroll) {
          e.preventDefault()
          node.scrollBy({ top: e.deltaY, left: e.deltaX, behavior: 'auto' })
          return
        }
        node = node.parentElement
      }
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [mounted])

  // ── Drag-to-snap in mini mode ──────────────────────────────────────────
  //
  // pragmatic-drag-and-drop's element adapter gives us a single `draggable()`
  // wire-up that handles dragstart/drag/drop with HTML5 DnD semantics behind
  // a clean API. During the drag we override the container's top/left
  // imperatively for smooth follow; on drop we compute the nearest corner
  // and persist it (the layout effect above then re-applies the snapped
  // position via cornerToPosition).
  //
  // The drag is wired to a dedicated handle (rendered inside MiniOverlay)
  // rather than the whole container so clicking the player to pause it
  // doesn't accidentally initiate a drag. The handle marks itself with
  // `data-mini-drag-handle="true"` and we restrict draggable to that node
  // via the `dragHandle` option (falling back to the container if missing).
  const dragHandleRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const container = containerRef.current
    const handle = dragHandleRef.current
    if (!container || mode !== 'mini') return

    // pragmatic-drag-and-drop tracks the pointer offset internally, so we
    // just store the rect at drag start and translate by the delta we read
    // out of `location.current.input` on each drag event.
    let startRect: DOMRect | null = null
    return draggable({
      element: handle ?? container,
      onDragStart: () => {
        // Disable the snap-back transition during drag.
        container.style.transition = 'none'
        startRect = container.getBoundingClientRect()
      },
      onDrag: ({ location }) => {
        if (!startRect) return
        const dx = location.current.input.clientX - location.initial.input.clientX
        const dy = location.current.input.clientY - location.initial.input.clientY
        container.style.left = `${startRect.left + dx}px`
        container.style.top = `${startRect.top + dy}px`
      },
      onDrop: () => {
        if (!startRect) return
        const rect = container.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const snapped = nearestCorner(centerX, centerY)
        // Smooth slide to the chosen corner.
        container.style.transition = 'top 200ms ease-out, left 200ms ease-out'
        const { top, left } = cornerToPosition(snapped)
        container.style.top = `${top}px`
        container.style.left = `${left}px`
        startRect = null
        // Always persist the snapped corner. We deliberately don't dedupe
        // against the closed-over `corner`: it's derived from the async settings
        // query and lags until the post-mutate refetch lands, so a fast second
        // drag could compare against a stale value and skip a needed persist.
        // The write is idempotent, so persisting unconditionally is safe. (F73)
        persistCorner.mutate({ key: SETTING_KEYS.miniPlayerCorner, value: snapped })
      }
    })
    // `mounted` is intentionally NOT a dep: the effect body never reads it, and
    // it's derived from `mode` (already a dep), so it would only add redundant
    // re-registrations of the draggable() wiring (F78).
  }, [mode, persistCorner])

  // ── Player keyboard shortcuts (active only in detail mode) ──────────────
  const shortcutsEnabled = mode === 'detail' && Boolean(videoId)
  const withVideo = useCallback(
    (fn: (el: HTMLVideoElement) => void) => () => {
      const el = videoRef.current
      if (!el) return
      fn(el)
    },
    []
  )

  useShortcut(
    ' ',
    withVideo((el) => (el.paused ? void el.play().catch(() => {}) : el.pause())),
    {
      enabled: shortcutsEnabled
    }
  )
  useShortcut(
    'k',
    withVideo((el) => el.pause()),
    { enabled: shortcutsEnabled }
  )
  useShortcut(
    'j',
    withVideo((el) => {
      el.currentTime = Math.max(0, el.currentTime - 10)
    }),
    { enabled: shortcutsEnabled }
  )
  useShortcut(
    'l',
    withVideo((el) => {
      el.currentTime = Math.min(el.duration || el.currentTime + 10, el.currentTime + 10)
    }),
    { enabled: shortcutsEnabled }
  )
  useShortcut(
    'ArrowLeft',
    withVideo((el) => {
      el.currentTime = Math.max(0, el.currentTime - 5)
    }),
    { enabled: shortcutsEnabled }
  )
  useShortcut(
    'ArrowRight',
    withVideo((el) => {
      el.currentTime = Math.min(el.duration || el.currentTime + 5, el.currentTime + 5)
    }),
    { enabled: shortcutsEnabled }
  )
  useShortcut(
    'ArrowUp',
    withVideo((el) => {
      el.volume = Math.min(1, el.volume + 0.1)
      el.muted = false
    }),
    { enabled: shortcutsEnabled }
  )
  useShortcut(
    'ArrowDown',
    withVideo((el) => {
      el.volume = Math.max(0, el.volume - 0.1)
    }),
    { enabled: shortcutsEnabled }
  )
  useShortcut(
    'm',
    withVideo((el) => {
      el.muted = !el.muted
    }),
    { enabled: shortcutsEnabled }
  )
  useShortcut(
    'f',
    withVideo((el) => {
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {})
      } else {
        void el.requestFullscreen().catch(() => {})
      }
    }),
    { enabled: shortcutsEnabled }
  )
  // 0–9 jump shortcuts (each is its own listener so chord buffers don't clash)
  useShortcut(
    '0',
    withVideo((el) => seekToPercent(el, 0)),
    { enabled: shortcutsEnabled }
  )
  useShortcut(
    '1',
    withVideo((el) => seekToPercent(el, 0.1)),
    { enabled: shortcutsEnabled }
  )
  useShortcut(
    '2',
    withVideo((el) => seekToPercent(el, 0.2)),
    { enabled: shortcutsEnabled }
  )
  useShortcut(
    '3',
    withVideo((el) => seekToPercent(el, 0.3)),
    { enabled: shortcutsEnabled }
  )
  useShortcut(
    '4',
    withVideo((el) => seekToPercent(el, 0.4)),
    { enabled: shortcutsEnabled }
  )
  useShortcut(
    '5',
    withVideo((el) => seekToPercent(el, 0.5)),
    { enabled: shortcutsEnabled }
  )
  useShortcut(
    '6',
    withVideo((el) => seekToPercent(el, 0.6)),
    { enabled: shortcutsEnabled }
  )
  useShortcut(
    '7',
    withVideo((el) => seekToPercent(el, 0.7)),
    { enabled: shortcutsEnabled }
  )
  useShortcut(
    '8',
    withVideo((el) => seekToPercent(el, 0.8)),
    { enabled: shortcutsEnabled }
  )
  useShortcut(
    '9',
    withVideo((el) => seekToPercent(el, 0.9)),
    { enabled: shortcutsEnabled }
  )

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
        // z-70 places the player above the root header (z-60). The mini
        // player and the detail-mode preview both need to float over the
        // app's top chrome — without this the breadcrumb / search bar
        // sits on top and clips the video. See the wheel-forward effect
        // for why this doesn't trap page scrolling.
        'fixed z-70 overflow-hidden bg-black',
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
          onError={(e) => {
            // Capture and log the full MediaError state. Without this the
            // generic UnsupportedFallback masks four very different
            // failure modes (network, decode, src-not-supported, abort)
            // behind one "Browser can't play this codec" message.
            const el = e.currentTarget
            const err = el.error
            const codeName = err
              ? (['UNKNOWN', 'ABORTED', 'NETWORK', 'DECODE', 'SRC_NOT_SUPPORTED'][err.code] ??
                `code${err.code}`)
              : 'no-error-object'
            console.error('[PersistentPlayer] <video> error', {
              videoId,
              mediaKind,
              code: err?.code,
              codeName,
              message: err?.message ?? '(empty)',
              networkState: el.networkState,
              readyState: el.readyState,
              currentSrc: el.currentSrc,
              src
            })
            setErroredId(videoId)
          }}
          onLoadStart={() => {
            // DEV-only: these fire on every media load / queue advance, and the
            // console.log monkey-patch ships them to the on-disk log over IPC —
            // don't pollute production logs on every play. onError stays. (F47)
            if (import.meta.env.DEV) {
              console.log('[PersistentPlayer] <video> loadstart', { videoId, mediaKind, src })
            }
          }}
          onLoadedMetadata={(e) => {
            const el = e.currentTarget
            if (import.meta.env.DEV) {
              console.log('[PersistentPlayer] <video> loadedmetadata', {
                videoId,
                duration: el.duration,
                videoWidth: el.videoWidth,
                videoHeight: el.videoHeight
              })
            }
          }}
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
          dragHandleRef={dragHandleRef}
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
  onOpenExternally,
  dragHandleRef
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
  dragHandleRef: React.RefObject<HTMLDivElement | null>
}): React.ReactElement {
  const { t } = useTranslation('player')
  return (
    <>
      {/*
        Drag affordance — sits at the top centre of the mini player, fades in
        on hover so it doesn't fight with the video for visual attention.
        pragmatic-drag-and-drop attaches its listeners to this element via
        dragHandleRef so a click *anywhere else* on the player (e.g. on the
        video to pause) doesn't accidentally initiate a drag.
      */}
      <div
        ref={dragHandleRef}
        aria-label={t('dragHandleAria')}
        className="absolute inset-x-0 top-0 flex h-6 cursor-grab items-center justify-center bg-linear-to-b from-black/60 to-transparent text-white/60 opacity-0 transition-opacity hover:opacity-100 active:cursor-grabbing"
      >
        <GripHorizontal className="size-3" />
      </div>
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
