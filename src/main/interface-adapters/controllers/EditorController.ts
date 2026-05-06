import type { ICancelRender } from '@use-cases/ICancelRender'
import type { IRenderCutFromVideo } from '@use-cases/IRenderCutFromVideo'
import type { IEditorSessionStore, IWindowManager } from '@domain/ports'
import { createTypedHandler } from './create-typed-handler'

/**
 * IPC controller for the in-app editor.
 *
 * Registers:
 *   - `editor-open-window`   → spawn or focus the editor window
 *   - `editor-start-render`  → enqueue a render and return jobId+cutId
 *   - `editor-cancel-render` → abort an in-flight render
 *   - `editor-get-session`   → read-back current session state for
 *                              the sidebar progress chip
 *
 * Push-channel `render-progress` is fired by `RenderCutFromVideo`
 * via the `INotifier`, not from this controller.
 */
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
}
