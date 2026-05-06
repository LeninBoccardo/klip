import type { IEditorSessionStore } from '@domain/ports'
import type { ICancelRender } from './ICancelRender'

/**
 * Fires the AbortSignal for an in-flight render. The render task in
 * `RenderCutFromVideo` is responsible for the cleanup (staging file
 * unlink, Cut-row delete, session finalize) — this use case does
 * nothing else, so cancel is idempotent and safe to call from
 * multiple UI surfaces.
 */
export class CancelRender implements ICancelRender {
  constructor(private readonly sessions: IEditorSessionStore) {}

  async execute(jobId: string): Promise<void> {
    const controller = this.sessions.getAbortController(jobId)
    if (!controller) {
      // No-op rather than throw — the render may have just finished
      // between the user clicking Cancel and the IPC arriving in main.
      return
    }
    if (!controller.signal.aborted) {
      controller.abort()
    }
  }
}
