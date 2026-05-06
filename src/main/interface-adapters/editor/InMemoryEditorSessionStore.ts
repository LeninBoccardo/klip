import type { IEditorSessionStore } from '@domain/ports'
import type { EditorSessionState, RenderJobStatus } from '@shared/types'

interface SessionEntry {
  state: EditorSessionState
  controller: AbortController
}

/**
 * Process-local in-memory implementation of `IEditorSessionStore`.
 *
 * The store is intentionally not persisted — render jobs do not survive a
 * main-process restart (the AbortController is the controlling primitive,
 * and an abort signal cannot be reattached to a child process that has
 * already exited). Crash-recovery is handled separately by the
 * `RecoverOperations` use case via the `operations` table, which marks
 * stale render rows as rolled-back and cleans up their staging files.
 *
 * Reads return shallow clones so callers can't mutate the registry by
 * holding onto a reference. Writes are explicit through `update()` /
 * `finalize()`.
 */
export class InMemoryEditorSessionStore implements IEditorSessionStore {
  private readonly sessions = new Map<string, SessionEntry>()

  open(session: EditorSessionState, controller: AbortController): void {
    if (this.sessions.has(session.jobId)) {
      throw new Error(`EditorSession ${session.jobId} is already open`)
    }
    this.sessions.set(session.jobId, { state: { ...session }, controller })
  }

  get(jobId: string): EditorSessionState | null {
    const entry = this.sessions.get(jobId)
    return entry ? { ...entry.state } : null
  }

  getAbortController(jobId: string): AbortController | null {
    return this.sessions.get(jobId)?.controller ?? null
  }

  update(
    jobId: string,
    patch: { status?: RenderJobStatus; percent?: number | null; errorMessage?: string | null }
  ): void {
    const entry = this.sessions.get(jobId)
    if (!entry) return
    if (patch.status !== undefined) entry.state.status = patch.status
    if (patch.percent !== undefined) entry.state.percent = patch.percent
    if (patch.errorMessage !== undefined) entry.state.errorMessage = patch.errorMessage
  }

  finalize(jobId: string, status: 'complete' | 'error' | 'cancelled', errorMessage?: string): void {
    const entry = this.sessions.get(jobId)
    if (!entry) return
    entry.state.status = status
    entry.state.finishedAt = new Date().toISOString()
    if (errorMessage !== undefined) entry.state.errorMessage = errorMessage
    if (status === 'complete') entry.state.percent = 100
  }

  list(): EditorSessionState[] {
    return Array.from(this.sessions.values()).map((e) => ({ ...e.state }))
  }

  remove(jobId: string): void {
    this.sessions.delete(jobId)
  }
}
