/**
 * Port for cancelling an in-flight render.
 *
 * Implemented by `CancelRender`: looks up the AbortController in the
 * `IEditorSessionStore` and aborts. The actual cleanup (staging file,
 * partial Cut row, finalizing the session) happens in the
 * RenderCutFromVideo task's catch path — this use case only fires
 * the signal.
 */
export interface ICancelRender {
  execute(jobId: string): Promise<void>
}
