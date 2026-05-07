import type { ICancelRender } from '@use-cases/ICancelRender'
import type { IRenderCutFromVideo } from '@use-cases/IRenderCutFromVideo'
import type { IEditorSessionStore, IWindowManager } from '@domain/ports'
import { createTypedHandler } from './create-typed-handler'

/**
 * IPC controller for the in-app editor.
 *
 * Registers:
 *   - `editor-open-window`             → spawn or focus the editor window
 *   - `editor-start-render`            → enqueue a render and return jobId+cutId
 *   - `editor-cancel-render`           → abort an in-flight render
 *   - `editor-get-session`             → read-back current session by jobId
 *                                        (sidebar progress chip after a
 *                                        push event lands)
 *   - `editor-find-session-by-source`  → look up the active session for
 *                                        a source video (HP-7: editor-
 *                                        window rehydration after close
 *                                        + reopen mid-render)
 *
 * Push-channel `render-progress` is fired by `RenderCutFromVideo`
 * via the `INotifier`, not from this controller.
 */
const NON_TERMINAL_STATUSES = new Set(['queued', 'rendering', 'finalizing'])

export function registerEditorController(deps: {
  windowManager: IWindowManager
  renderCut: IRenderCutFromVideo
  cancelRender: ICancelRender
  sessions: IEditorSessionStore
}): void {
  const { windowManager, renderCut, cancelRender, sessions } = deps

  createTypedHandler('editor-open-window', async (_event, input) => {
    windowManager.openEditorWindow(input)
  })

  createTypedHandler('editor-start-render', async (_event, request) => {
    return renderCut.execute(request)
  })

  createTypedHandler('editor-cancel-render', async (_event, jobId) => {
    await cancelRender.execute(jobId)
  })

  createTypedHandler('editor-get-session', async (_event, jobId) => {
    return sessions.get(jobId)
  })

  createTypedHandler('editor-find-session-by-source', async (_event, sourceVideoId) => {
    // The queue is concurrency=1 + WindowManager enforces 1-of-N editor
    // windows, so at most one non-terminal session for a given source can
    // exist at a time. If multiple ever did (future v2), pick the most
    // recent — the user opening the editor cares about what's running NOW.
    const matching = sessions
      .list()
      .filter(
        (s) => s.recipe.sourceVideoId === sourceVideoId && NON_TERMINAL_STATUSES.has(s.status)
      )
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
    return matching[0] ?? null
  })
}
