import { StrictMode, useEffect } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { TooltipProvider } from '@ui/tooltip'
import { Toaster } from '@ui/sonner'
import { queryClient } from '@/lib/query-client'
import { useEditorStore } from '@/hooks/use-editor-store'
import { useRenderProgressListener } from '@/hooks/use-render-progress'
import { EditorView } from '@components/features/editor/EditorView'

interface EditorAppProps {
  /** Source video id parsed from the editor window's URL hash by `main.tsx`. */
  sourceVideoId: string
}

/**
 * Alternate root for the dedicated editor window (plan §9.1). Mounted
 * by `main.tsx` when `window.location.hash` starts with `#/editor/`.
 *
 * Deliberately NOT wrapped by:
 *   - `SidebarProvider` / `AppSidebar` — the editor needs the full width.
 *   - `PersistentPlayer` — the editor has its own preview surface and
 *     can't share the singleton player with the main window without
 *     stepping on its <video> element.
 *   - TanStack Router — the editor is a single fixed view; navigation
 *     happens by closing the window or `editorOpenWindow` re-navigating
 *     to a new source. Skipping the router keeps the editor bundle tiny
 *     and removes a class of "router didn't reset state" bugs.
 *
 * Shared with the main window:
 *   - `QueryClientProvider` — DB-backed reads (e.g. video metadata)
 *     route through the same cache; `db-updated` push events keep both
 *     windows in sync.
 *   - `ThemeProvider` — same theme storage key, so the editor inherits
 *     the user's light/dark preference without a flicker.
 *   - `TooltipProvider`, `Toaster` — primitives the editor's components
 *     rely on.
 */
export function EditorApp({ sourceVideoId }: EditorAppProps): React.ReactElement {
  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="klip-theme">
          <TooltipProvider>
            <EditorBootstrap sourceVideoId={sourceVideoId} />
            <Toaster richColors closeButton />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </StrictMode>
  )
}

/**
 * Hosts the editor view + the side-effects that need React context.
 * Split out of `EditorApp` so the providers above stay declarative.
 */
function EditorBootstrap({ sourceVideoId }: { sourceVideoId: string }): React.ReactElement {
  useRenderProgressListener()
  useHashChangeReload()
  useSourceVideoBootstrap(sourceVideoId)
  useResumeActiveRender(sourceVideoId)

  return <EditorView sourceVideoId={sourceVideoId} />
}

/**
 * The window manager re-navigates the editor window via hash when the
 * user picks "Edit" on a different source video while the editor is
 * already open (the 1-of-N policy from plan §9.3). Browsers don't
 * reload on hashchange, so we listen and force a hard reload — that
 * gives EditorApp a clean re-init with the new sourceVideoId rather
 * than trying to reset every piece of state in the store imperatively.
 */
function useHashChangeReload(): void {
  useEffect(() => {
    const onHashChange = (): void => {
      window.location.reload()
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
}

/**
 * HP-7 — rehydrate the editor's job mirror after a window close→reopen
 * mid-render. The render-progress listener filters events by activeJobId,
 * so without this hook the renderer would silently drop progress for the
 * job that's still running in main, and the user would see a clean
 * editor with no indication anything is happening.
 *
 * Asks main for any non-terminal session matching the current source.
 * Primes `beginTracking` + `updateJob` so the next push event lands
 * inside the filter.
 *
 * Gates on `timeline !== null` so this runs *after* `initSourceVideo`
 * (which clears the job mirror as part of seeding a fresh source). If
 * we fired earlier, source bootstrap could land second and wipe the
 * primed mirror — a real race, since both hooks await IPC in parallel.
 */
function useResumeActiveRender(sourceVideoId: string): void {
  const timelineReady = useEditorStore((s) => s.timeline !== null)
  const beginTracking = useEditorStore((s) => s.beginTracking)
  const updateJob = useEditorStore((s) => s.updateJob)

  useEffect(() => {
    if (!timelineReady) return
    let cancelled = false
    window.api
      .editorFindSessionBySource(sourceVideoId)
      .then((session) => {
        if (cancelled || !session) return
        beginTracking({ jobId: session.jobId, cutId: session.cutId })
        updateJob({
          jobId: session.jobId,
          status: session.status,
          percent: session.percent,
          errorMessage: session.errorMessage ?? undefined
        })
      })
      .catch((err) => {
        // Rehydration is best-effort. If the lookup fails, the user
        // just won't see live progress until the next event lands —
        // but the render itself is unaffected.
        console.warn('[klip:editor] failed to rehydrate active session:', err)
      })
    return () => {
      cancelled = true
    }
  }, [timelineReady, sourceVideoId, beginTracking, updateJob])
}

/**
 * Once the source video's metadata is loaded (specifically its duration),
 * seed the editor store. Phase 7's components depend on `timeline` being
 * present; the EditorView renders a loading state until duration arrives.
 */
function useSourceVideoBootstrap(sourceVideoId: string): void {
  const initSourceVideo = useEditorStore((s) => s.initSourceVideo)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const video = await window.api.getVideoById(sourceVideoId)
      if (cancelled) return
      if (!video) {
        // The editor window was opened against an id that no longer
        // resolves. Show a hard error rather than a half-functional view.
        console.error(`[klip:editor] source video not found: ${sourceVideoId}`)
        return
      }
      const duration = video.duration ?? 0
      if (duration <= 0) {
        // Probe-pending — the source video exists but ffprobe hasn't run
        // yet. The main-window Edit button gates against this, but log
        // here too so an externally-opened editor URL surfaces the cause.
        console.warn(`[klip:editor] source video duration unknown: ${sourceVideoId}`)
      }

      // Creator lookup is a sub-millisecond DB hit and only used for the
      // header chrome; fall back to an empty name if the row is missing
      // rather than refusing to bootstrap the editor.
      const creator = await window.api.getCreatorById(video.creatorId)
      if (cancelled) return

      initSourceVideo({
        sourceVideoId,
        sourceTitle: video.title,
        sourceCreatorName: creator?.name ?? '',
        durationSec: duration
      })
    })().catch((err) => {
      console.error('[klip:editor] source video bootstrap failed:', err)
    })
    return () => {
      cancelled = true
    }
  }, [sourceVideoId, initSourceVideo])
}
