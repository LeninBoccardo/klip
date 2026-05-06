import { create } from 'zustand'
import type { RenderJobStatus } from '@shared/types'
import type { TimelineState } from '@/lib/recipe-from-timeline'
import { timelineForSource } from '@/lib/recipe-from-timeline'

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
 * and the session, and a reopened editor rehydrates by calling
 * `editorGetSession(jobId)`. We do not try to keep two independent
 * sources of truth.
 */
export type RenderMode = 'copy' | 'reencode'

interface EditorState {
  /** The source video id parsed from the editor window's URL hash. */
  sourceVideoId: string | null

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
  initSourceVideo(input: { sourceVideoId: string; durationSec: number }): void

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
  timeline: null,
  renderMode: 'copy',
  activeJobId: null,
  activeJobCutId: null,
  activeJobStatus: null,
  activeJobPercent: null,
  activeJobError: null,

  initSourceVideo({ sourceVideoId, durationSec }) {
    const timeline = timelineForSource({ sourceVideoId, durationSec })
    set({
      sourceVideoId,
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
      if (!tl) return {}
      const clip = tl.tracks[0].clips[0]
      const clamped = clamp(sec, 0, clip.durationSec)
      // If we have an out point, ensure in < out; otherwise just set in.
      const existingOut = clip.region?.outSec ?? null
      const newOut = existingOut !== null && existingOut > clamped ? existingOut : null
      return {
        timeline: writeRegion(tl, { inSec: clamped, outSec: newOut ?? clamped + 0.001 })
      }
    })
  },
  setOutPoint(sec) {
    set((state) => {
      const tl = state.timeline
      if (!tl) return {}
      const clip = tl.tracks[0].clips[0]
      const clamped = clamp(sec, 0, clip.durationSec)
      // If we have an in point, ensure out > in; otherwise default in to 0.
      const existingIn = clip.region?.inSec ?? 0
      const newIn = existingIn < clamped ? existingIn : Math.max(0, clamped - 0.001)
      return {
        timeline: writeRegion(tl, { inSec: newIn, outSec: clamped })
      }
    })
  },
  clearRegion() {
    set((state) => (state.timeline ? { timeline: writeRegion(state.timeline, null) } : {}))
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

function writeRegion(
  state: TimelineState,
  region: { inSec: number; outSec: number } | null
): TimelineState {
  return {
    ...state,
    tracks: [
      {
        ...state.tracks[0],
        clips: [{ ...state.tracks[0].clips[0], region }]
      }
    ]
  }
}
