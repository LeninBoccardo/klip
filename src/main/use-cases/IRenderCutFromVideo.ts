import type { RenderCutRequest, RenderCutResponse } from '@shared/types'

/**
 * Port for the editor's render-and-save use case.
 *
 * `execute()` is fire-and-forget from the renderer's perspective: it
 * returns the `jobId` + `cutId` immediately, then the actual render runs
 * in the queue. Progress reaches the renderer through `'render-progress'`
 * push events (see `INotifier`). Cancellation is via `ICancelRender`,
 * not a returned handle, so any IPC entry point can abort.
 */
export interface IRenderCutFromVideo {
  execute(request: RenderCutRequest): Promise<RenderCutResponse>
}
