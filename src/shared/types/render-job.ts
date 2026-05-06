import type { EditRecipe } from './edit-recipe'

export type RenderJobStatus =
  | 'queued'
  | 'rendering'
  | 'finalizing'
  | 'complete'
  | 'error'
  | 'cancelled'

/**
 * Real-time progress update pushed from main → all renderer windows on the
 * `render-progress` channel. Mirrors the `DownloadProgress` shape so the
 * sidebar progress chip and the editor's full bar can use the same listener
 * pattern.
 */
export interface RenderProgress {
  jobId: string
  cutId: string
  sourceVideoId: string
  status: RenderJobStatus
  /** 0–100; null while ffmpeg is still in pre-flight (no `out_time_us` yet). */
  percent: number | null
  /** Negative = transient/retriable, set on `status: 'error'`. */
  retriable?: boolean
  errorMessage?: string
}

export interface RenderResult {
  jobId: string
  cutId: string
  outputPath: string
  /** Wall-clock duration in ms; useful for telemetry / "took 12s" UX. */
  durationMs: number
}

/**
 * Snapshot of the in-flight edit session held in the main process.
 * Read by both windows via `editor:getSession` so the sidebar chip can
 * resurface "rendering 42%" without holding renderer state, and the editor
 * window can rehydrate after a window reopen.
 */
export interface EditorSessionState {
  jobId: string
  cutId: string
  recipe: EditRecipe
  status: RenderJobStatus
  percent: number | null
  startedAt: string
  finishedAt: string | null
  errorMessage: string | null
}
