import { create } from 'zustand'
import type { RenderJobStatus } from '@shared/types'
import type { TimelineState } from '@/lib/recipe-from-timeline'
import { getActiveClip, timelineForSource, updateActiveClip } from '@/lib/recipe-from-timeline'

/**
 * Zustand store for the editor window. Per plan §9.2 the *authoritative*
 * render-job state lives in the main process — this store is just the
 * editor renderer's view of:
 *
 *   - the timeline being edited (graph-shaped per §10.4),
 *   - the precision toggle (`-c copy` vs re-encode),
 *   - the *latest known* status of an in-flight render, mirrored from
 *     the `render-progress` push channel for fast reactive updates.
 *
 * The mirror is fed by `useRenderProgressListener`; if the editor window
 * is closed mid-render, the main process keeps owning the AbortController
 * and the session. A reopened editor rehydrates the mirror via
 * `useResumeActiveRender` in `EditorApp.tsx`, which calls
 * `editorFindSessionBySource(sourceVideoId)` and primes
 * `beginTracking` + `updateJob` from the snapshot before the next push
 * event lands. We do not try to keep two independent sources of truth.
 */
export type RenderMode = 'copy' | 'reencode'

interface EditorState {
  /** The source video id parsed from the editor window's URL hash. */
  sourceVideoId: string | null

  /** Title of the source video, fetched alongside duration during bootstrap. */
  sourceTitle: string | null

  /** Display name of the creator that owns the source video. */
  sourceCreatorName: string | null

  /** The graph-shaped timeline. Initialised once the source duration is known. */
  timeline: TimelineState | null

  /** Default render mode; flipped by the precision toggle in the save dialog. */
  renderMode: RenderMode

  /** Currently-tracked job, mirrored from the main-process session. */
  activeJobId: string | null
  activeJobCutId: string | null
  activeJobStatus: RenderJobStatus | null
  activeJobPercent: number | null
  activeJobError: string | null

  // ── Setup ──
  initSourceVideo(input: {
    sourceVideoId: string
    sourceTitle: string
    sourceCreatorName: string
    durationSec: number
  }): void

  // ── Timeline mutations ──
  setCursor(sec: number): void
  setZoom(pxPerSec: number): void
  setScroll(sec: number): void
  setInPoint(sec: number): void
  setOutPoint(sec: number): void
  /** Drop the in/out region — used when starting fresh on the same source. */
  clearRegion(): void

  // ── Render mode ──
  setRenderMode(mode: RenderMode): void

  // ── Job mirror (driven by `useRenderProgressListener`) ──
  beginTracking(input: { jobId: string; cutId: string }): void
  updateJob(input: {
    jobId: string
    status: RenderJobStatus
    percent: number | null
    errorMessage?: string
  }): void
  /** Drop the active-job mirror; lets the UI return to "ready to render". */
  clearJob(): void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  sourceVideoId: null,
  sourceTitle: null,
  sourceCreatorName: null,
  timeline: null,
  renderMode: 'copy',
  activeJobId: null,
  activeJobCutId: null,
  activeJobStatus: null,
  activeJobPercent: null,
  activeJobError: null,

  initSourceVideo({ sourceVideoId, sourceTitle, sourceCreatorName, durationSec }) {
    const timeline = timelineForSource({ sourceVideoId, durationSec })
    set({
      sourceVideoId,
      sourceTitle,
      sourceCreatorName,
      timeline,
      // A fresh source clears any stale job mirror — the previous render
      // (if any) is unrelated to the new working surface.
      activeJobId: null,
      activeJobCutId: null,
      activeJobStatus: null,
      activeJobPercent: null,
      activeJobError: null
    })
  },

  setCursor(sec) {
    set((state) => (state.timeline ? { timeline: { ...state.timeline, cursorSec: sec } } : {}))
  },
  setZoom(pxPerSec) {
    set((state) =>
      state.timeline ? { timeline: { ...state.timeline, zoomPxPerSec: pxPerSec } } : {}
    )
  },
  setScroll(sec) {
    set((state) =>
      state.timeline ? { timeline: { ...state.timeline, scrollSec: Math.max(0, sec) } } : {}
    )
  },
  setInPoint(sec) {
    set((state) => {
      const tl = state.timeline
      const clip = tl ? getActiveClip(tl) : null
      if (!tl || !clip) return {}
      const clamped = clamp(sec, 0, clip.durationSec)
      const existingOut = clip.region?.outSec ?? null

      // Refuse marks that would invert or collapse the region (new in
      // at-or-past existing out). Earlier behaviour silently overwrote
      // the user's existing out with `clamped + 0.001`, destroying their
      // input. The user must `clearRegion()` to start over.
      if (existingOut !== null && clamped >= existingOut) {
        console.warn(
          '[klip:editor] setInPoint refused — would invert the region; clearRegion() to reset'
        )
        return {}
      }

      // No existing out: default to end-of-clip so the region is
      // immediately saveable. The user refines via setOutPoint.
      const outSec = existingOut ?? clip.durationSec

      // Boundary case: in-mark at the very end of the clip with no room
      // for an out-mark. Refuse rather than emit an unsaveable region.
      if (clamped >= outSec) {
        console.warn('[klip:editor] setInPoint refused — no room for an out-point past the mark')
        return {}
      }

      return {
        timeline: updateActiveClip(tl, (c) => ({
          ...c,
          region: { inSec: clamped, outSec }
        }))
      }
    })
  },
  setOutPoint(sec) {
    set((state) => {
      const tl = state.timeline
      const clip = tl ? getActiveClip(tl) : null
      if (!tl || !clip) return {}
      const clamped = clamp(sec, 0, clip.durationSec)
      const existingIn = clip.region?.inSec ?? null

      // Symmetric to setInPoint: refuse marks that would invert the
      // region rather than silently clobber the existing in-point.
      if (existingIn !== null && clamped <= existingIn) {
        console.warn(
          '[klip:editor] setOutPoint refused — would invert the region; clearRegion() to reset'
        )
        return {}
      }

      const inSec = existingIn ?? 0

      if (clamped <= inSec) {
        console.warn('[klip:editor] setOutPoint refused — no room for an in-point before the mark')
        return {}
      }

      return {
        timeline: updateActiveClip(tl, (c) => ({
          ...c,
          region: { inSec, outSec: clamped }
        }))
      }
    })
  },
  clearRegion() {
    set((state) =>
      state.timeline
        ? { timeline: updateActiveClip(state.timeline, (c) => ({ ...c, region: null })) }
        : {}
    )
  },

  setRenderMode(mode) {
    set({ renderMode: mode })
  },

  beginTracking({ jobId, cutId }) {
    set({
      activeJobId: jobId,
      activeJobCutId: cutId,
      activeJobStatus: 'queued',
      activeJobPercent: null,
      activeJobError: null
    })
  },
  updateJob({ jobId, status, percent, errorMessage }) {
    // Filter on the active jobId so a stale event from a previous render
    // (the editor was reopened on a new job) doesn't overwrite current state.
    if (get().activeJobId !== jobId) return
    set({
      activeJobStatus: status,
      activeJobPercent: percent,
      activeJobError: errorMessage ?? null
    })
  },
  clearJob() {
    set({
      activeJobId: null,
      activeJobCutId: null,
      activeJobStatus: null,
      activeJobPercent: null,
      activeJobError: null
    })
  }
}))

// ── Helpers ──

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
