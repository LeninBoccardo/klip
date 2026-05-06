import { useEditorStore } from '@/hooks/use-editor-store'

/**
 * Phase 6 shell. Phase 7 fills in:
 *   - The preview <video> mounted against `klip-media://video/<id>/file`.
 *   - The hand-rolled timeline + thumbnail strip (recipe-from-timeline).
 *   - InOutHandles, PrecisionToggle, RenderProgress, SaveCutDialog.
 *
 * What we render today is a deliberate placeholder so the rest of the
 * Phase 5 IPC + WindowManager wiring is exercisable end-to-end —
 * `editor:openWindow` opens this view, the store boots from the source
 * video's metadata, and the render-progress listener mounts so the
 * forthcoming components have live state to react against.
 */
export function EditorView({ sourceVideoId }: { sourceVideoId: string }): React.ReactElement {
  const timeline = useEditorStore((s) => s.timeline)
  const renderMode = useEditorStore((s) => s.renderMode)
  const activeJobStatus = useEditorStore((s) => s.activeJobStatus)
  const activeJobPercent = useEditorStore((s) => s.activeJobPercent)

  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4 text-sm">
        <span className="font-medium">Editor</span>
        <span className="text-muted-foreground">·</span>
        <code className="text-xs text-muted-foreground">{sourceVideoId}</code>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
        {!timeline && <span>Loading source video metadata…</span>}
        {timeline && (
          <>
            <span>Editor shell wired. Timeline + components arrive in phase 7.</span>
            <span className="text-xs">
              duration: {timeline.tracks[0].clips[0].durationSec.toFixed(2)}s · mode: {renderMode}
            </span>
            {activeJobStatus && (
              <span className="text-xs">
                job: {activeJobStatus}
                {activeJobPercent !== null ? ` (${activeJobPercent.toFixed(1)}%)` : ''}
              </span>
            )}
          </>
        )}
      </main>
    </div>
  )
}
