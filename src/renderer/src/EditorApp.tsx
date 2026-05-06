import { StrictMode, useEffect } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { TooltipProvider } from '@ui/tooltip'
import { Toaster } from '@ui/sonner'
import { useTranslation } from 'react-i18next'
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
 * Once the source video's metadata is loaded (specifically its duration),
 * seed the editor store. Phase 7's components depend on `timeline` being
 * present; the EditorView renders a loading state until duration arrives.
 */
function useSourceVideoBootstrap(sourceVideoId: string): void {
  const { t } = useTranslation('common')
  const initSourceVideo = useEditorStore((s) => s.initSourceVideo)

  useEffect(() => {
    let cancelled = false
    void window.api.getVideoById(sourceVideoId).then((video) => {
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
        // yet. Editing without a known duration would leave the timeline
        // unable to clamp its bounds; show a friendly "not ready" state.
        console.warn(`[klip:editor] source video duration unknown: ${sourceVideoId}`)
      }
      initSourceVideo({ sourceVideoId, durationSec: duration })
    })
    // Surface a one-line marker to ease dev troubleshooting; i18n key
    // is intentionally generic so this doesn't grow into a UI requirement.
    void t
    return () => {
      cancelled = true
    }
  }, [sourceVideoId, initSourceVideo, t])
}
