import type { EditorSessionState, RenderJobStatus } from '@shared/types'

/**
 * Main-process registry of in-flight render jobs. Owns the AbortController
 * for each job so cancellation can be initiated from any IPC entry point
 * (the editor window's "Cancel" button, the main window's progress chip,
 * or `app.before-quit`) without round-tripping through the queue.
 *
 * The state is held in main, not in either renderer's Zustand store —
 * that way the editor window can close mid-render and the job stays
 * visible to the main window's sidebar progress chip. See plan §9.2.
 *
 * MVP holds at most one active session at a time; the v2 Map-keyed
 * shape is in place from day one so multiple-projects-open is additive.
 */
export interface IEditorSessionStore {
  /** Register a brand-new session and return the AbortController the caller passed in. */
  open(session: EditorSessionState, controller: AbortController): void

  /** Get a snapshot of the session state. Returns null if no such jobId. */
  get(jobId: string): EditorSessionState | null

  /** Get the AbortController for a job, or null if not found. */
  getAbortController(jobId: string): AbortController | null

  /** Update the live status + percent of an in-flight session. */
  update(
    jobId: string,
    patch: { status?: RenderJobStatus; percent?: number | null; errorMessage?: string | null }
  ): void

  /** Mark the session terminal (complete | error | cancelled) and stamp finishedAt. */
  finalize(
    jobId: string,
    status: 'complete' | 'error' | 'cancelled',
    errorMessage?: string
  ): void

  /** All currently-known sessions; useful for the sidebar progress chip and recovery sweep. */
  list(): EditorSessionState[]

  /**
   * Drop a session from the registry. Use sparingly — UI surfaces may want to
   * keep the terminal record visible briefly after `finalize`. Recommended:
   * call from the recovery sweep or on explicit dismissal.
   */
  remove(jobId: string): void
}
