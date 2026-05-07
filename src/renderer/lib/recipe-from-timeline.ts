import type { EditOp, EditRecipe } from '@shared/types'

/**
 * Renderer-side timeline state. Graph-shaped (tracks → clips → region)
 * even when the graph has one node — the components iterate the arrays,
 * so v2 lifts the MVP "length === 1" invariant without rewriting render
 * logic. See plan §10.4 for the rationale.
 */
export interface Region {
  inSec: number
  outSec: number
}

export interface Clip {
  id: string
  sourceVideoId: string
  /** Offset of this clip relative to the track origin. MVP = 0 always. */
  offsetSec: number
  /** Full source duration, used to clamp `region` and render the strip. */
  durationSec: number
  /** Selected in/out region; null until the user marks both points. */
  region: Region | null
}

export interface Track {
  id: string
  clips: Clip[]
}

export interface TimelineState {
  tracks: Track[]
  /** Pixels per second for the current zoom level. */
  zoomPxPerSec: number
  /** Visible-area scroll position in seconds (left edge of the viewport). */
  scrollSec: number
  /** Playhead position in seconds. */
  cursorSec: number
}

/** MVP runtime invariant — exposed for the store's parse boundary and tests. */
export function assertSingleClipInvariant(state: TimelineState): void {
  if (state.tracks.length !== 1) {
    throw new Error(`MVP timeline must have exactly 1 track, got ${state.tracks.length}`)
  }
  const clips = state.tracks[0].clips
  if (clips.length !== 1) {
    throw new Error(`MVP timeline must have exactly 1 clip per track, got ${clips.length}`)
  }
}

// ── Active-clip access helpers (HP-8) ──
//
// MVP enforces "exactly one track with one clip"; consumers used to
// reach into `state.tracks[0].clips[0]` directly, which both broke the
// "graph shape is real, not theatre" claim of plan §10.4 *and* meant
// every v2 multi-clip change required edits at every call site.
//
// The helpers below centralise that access. v2 widens `getActiveClip`
// to honour a `selectedClipId` field on `TimelineState`; today it
// returns clips[0] of tracks[0]. Consumer code stays unchanged.

/**
 * The clip the user is currently working on. MVP: always
 * `tracks[0].clips[0]`. v2: the clip whose id matches a future
 * `state.selectedClipId`. Returns null only if the timeline is
 * uninitialised — calling code should typically check `timeline !== null`
 * before reaching for the clip.
 */
export function getActiveClip(state: TimelineState): Clip | null {
  return state.tracks[0]?.clips[0] ?? null
}

/**
 * Pure transform that replaces the active clip with the result of
 * `updater(clip)`. Preserves track ordering, never mutates the input,
 * and is the single write path the store mutators use to keep the
 * graph shape consistent. v2 lifts the invariant by iterating the
 * full graph here.
 */
export function updateActiveClip(
  state: TimelineState,
  updater: (clip: Clip) => Clip
): TimelineState {
  const track = state.tracks[0]
  if (!track || track.clips.length === 0) return state
  const clip = track.clips[0]
  const nextClip = updater(clip)
  if (nextClip === clip) return state
  return {
    ...state,
    tracks: [{ ...track, clips: [nextClip] }, ...state.tracks.slice(1)]
  }
}

/**
 * Build a fresh timeline for a single source video. Region starts unset;
 * the user marks in/out before saving. `durationSec` comes from the
 * source video's metadata (already probed by the existing pipeline).
 */
export function timelineForSource(input: {
  sourceVideoId: string
  durationSec: number
  zoomPxPerSec?: number
}): TimelineState {
  return {
    tracks: [
      {
        id: 'track-0',
        clips: [
          {
            id: 'clip-0',
            sourceVideoId: input.sourceVideoId,
            offsetSec: 0,
            durationSec: input.durationSec,
            region: null
          }
        ]
      }
    ],
    zoomPxPerSec: input.zoomPxPerSec ?? 50,
    scrollSec: 0,
    cursorSec: 0
  }
}

/**
 * Pure projection `TimelineState → EditRecipe`. MVP only emits a single
 * `trim` op; the recipe shape is otherwise authoritative for what the
 * backend will actually do.
 *
 * Throws if the timeline isn't in a saveable state (no region marked,
 * out ≤ in, or out exceeds source duration). The save dialog calls this
 * once at submit; the timeline UI calls a separate validity predicate
 * during interaction.
 */
export function recipeFromTimeline(
  state: TimelineState,
  output: { container: 'mp4' | 'webm' | 'mkv'; mode: 'copy' | 'reencode' }
): EditRecipe {
  assertSingleClipInvariant(state)
  const clip = getActiveClip(state)
  if (!clip) {
    throw new Error('No active clip — initialise the timeline before building a recipe')
  }
  const region = clip.region

  if (!region) {
    throw new Error('No region marked — set in and out points before saving')
  }
  if (region.outSec <= region.inSec) {
    throw new Error('Out point must be greater than in point')
  }
  if (region.inSec < 0 || region.outSec > clip.durationSec) {
    throw new Error('Region exceeds source video bounds')
  }

  return {
    version: 1,
    sourceVideoId: clip.sourceVideoId,
    ops: [{ type: 'trim', in: region.inSec, out: region.outSec }],
    output
  }
}

/**
 * Reverse projection `EditRecipe → TimelineState`. Only used by the v2
 * "re-edit this cut" flow (rehydrating the editor from a persisted
 * sidecar / DB column). MVP doesn't call this at runtime, but it lives
 * here from day one so the round-trip is testable and the projection
 * pair stays in lockstep.
 *
 * `durationSec` must come from the source video's current metadata —
 * the recipe doesn't carry it because v2 may want to relax the upper
 * bound (re-edits could extend toward a clip the source has grown into).
 */
export function timelineFromRecipe(
  recipe: EditRecipe,
  durationSec: number,
  zoomPxPerSec?: number
): TimelineState {
  if (recipe.ops.length !== 1) {
    throw new Error(`MVP timeline can only rehydrate a single op, got ${recipe.ops.length}`)
  }
  const op: EditOp = recipe.ops[0]
  if (op.type !== 'trim') {
    throw new Error(`MVP timeline can only rehydrate trim ops, got ${op.type}`)
  }

  return {
    tracks: [
      {
        id: 'track-0',
        clips: [
          {
            id: 'clip-0',
            sourceVideoId: recipe.sourceVideoId,
            offsetSec: 0,
            durationSec,
            region: { inSec: op.in, outSec: op.out }
          }
        ]
      }
    ],
    zoomPxPerSec: zoomPxPerSec ?? 50,
    scrollSec: 0,
    cursorSec: op.in
  }
}

/** Predicate version of the projection — used by the save button to know if it's clickable. */
export function isTimelineSaveable(state: TimelineState): boolean {
  if (state.tracks.length !== 1 || state.tracks[0].clips.length !== 1) return false
  const clip = getActiveClip(state)
  if (!clip) return false
  const region = clip.region
  if (!region) return false
  if (region.outSec <= region.inSec) return false
  if (region.inSec < 0 || region.outSec > clip.durationSec) return false
  return true
}
