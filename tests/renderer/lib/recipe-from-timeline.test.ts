import { describe, it, expect } from 'vitest'
import {
  assertSingleClipInvariant,
  getActiveClip,
  isTimelineSaveable,
  recipeFromTimeline,
  timelineForSource,
  timelineFromRecipe,
  updateActiveClip,
  type TimelineState
} from '@/lib/recipe-from-timeline'
import type { EditRecipe } from '@shared/types'

function timeline(overrides?: Partial<TimelineState>): TimelineState {
  return {
    tracks: [
      {
        id: 'track-0',
        clips: [
          {
            id: 'clip-0',
            sourceVideoId: 'src-1',
            offsetSec: 0,
            durationSec: 60,
            region: null
          }
        ]
      }
    ],
    zoomPxPerSec: 50,
    scrollSec: 0,
    cursorSec: 0,
    ...overrides
  }
}

describe('timelineForSource', () => {
  it('returns a graph-shaped state with 1 track / 1 clip / no region', () => {
    const state = timelineForSource({ sourceVideoId: 'abc', durationSec: 30 })
    expect(state.tracks).toHaveLength(1)
    expect(state.tracks[0].clips).toHaveLength(1)
    expect(state.tracks[0].clips[0].sourceVideoId).toBe('abc')
    expect(state.tracks[0].clips[0].durationSec).toBe(30)
    expect(state.tracks[0].clips[0].region).toBeNull()
  })

  it('seeds the cursor at 0 and uses the default zoom when not provided', () => {
    const state = timelineForSource({ sourceVideoId: 'abc', durationSec: 30 })
    expect(state.cursorSec).toBe(0)
    expect(state.zoomPxPerSec).toBe(50)
  })
})

describe('assertSingleClipInvariant', () => {
  it('passes for a 1-track / 1-clip state', () => {
    expect(() => assertSingleClipInvariant(timeline())).not.toThrow()
  })

  it('throws when there are zero tracks', () => {
    expect(() => assertSingleClipInvariant(timeline({ tracks: [] }))).toThrow(/exactly 1 track/)
  })

  it('throws when there are two tracks (v2 territory)', () => {
    const state = timeline()
    state.tracks.push({ id: 'track-1', clips: [] })
    expect(() => assertSingleClipInvariant(state)).toThrow(/exactly 1 track/)
  })

  it('throws when the single track has zero clips', () => {
    const state = timeline()
    state.tracks[0].clips = []
    expect(() => assertSingleClipInvariant(state)).toThrow(/exactly 1 clip/)
  })
})

describe('isTimelineSaveable', () => {
  it('rejects a state with no region', () => {
    expect(isTimelineSaveable(timeline())).toBe(false)
  })

  it('rejects a state where out ≤ in', () => {
    const t = timeline()
    t.tracks[0].clips[0].region = { inSec: 5, outSec: 5 }
    expect(isTimelineSaveable(t)).toBe(false)
  })

  it('rejects a region that overruns the source duration', () => {
    const t = timeline()
    t.tracks[0].clips[0].region = { inSec: 0, outSec: 70 } // duration = 60
    expect(isTimelineSaveable(t)).toBe(false)
  })

  it('rejects a region with a negative in-point', () => {
    const t = timeline()
    t.tracks[0].clips[0].region = { inSec: -1, outSec: 5 }
    expect(isTimelineSaveable(t)).toBe(false)
  })

  it('accepts a well-formed region', () => {
    const t = timeline()
    t.tracks[0].clips[0].region = { inSec: 1, outSec: 5 }
    expect(isTimelineSaveable(t)).toBe(true)
  })
})

describe('recipeFromTimeline', () => {
  it('emits a single-trim recipe with `in` and `out` matching the region', () => {
    const t = timeline()
    t.tracks[0].clips[0].region = { inSec: 1.5, outSec: 4.5 }
    const recipe = recipeFromTimeline(t, { container: 'mp4', mode: 'copy' })
    expect(recipe).toEqual({
      version: 1,
      sourceVideoId: 'src-1',
      ops: [{ type: 'trim', in: 1.5, out: 4.5 }],
      output: { container: 'mp4', mode: 'copy' }
    })
  })

  it('throws when the region is unset (the save dialog should have gated this)', () => {
    expect(() => recipeFromTimeline(timeline(), { container: 'mp4', mode: 'copy' })).toThrow(
      /No region marked/
    )
  })

  it('throws when out ≤ in', () => {
    const t = timeline()
    t.tracks[0].clips[0].region = { inSec: 5, outSec: 5 }
    expect(() => recipeFromTimeline(t, { container: 'mp4', mode: 'copy' })).toThrow(
      /Out point must be greater than in point/
    )
  })

  it('throws when the region exceeds the source bounds', () => {
    const t = timeline()
    t.tracks[0].clips[0].region = { inSec: 0, outSec: 70 }
    expect(() => recipeFromTimeline(t, { container: 'mp4', mode: 'copy' })).toThrow(
      /exceeds source video bounds/
    )
  })

  it('honours the chosen render mode and container', () => {
    const t = timeline()
    t.tracks[0].clips[0].region = { inSec: 0, outSec: 10 }
    const recipe = recipeFromTimeline(t, { container: 'webm', mode: 'reencode' })
    expect(recipe.output).toEqual({ container: 'webm', mode: 'reencode' })
  })
})

describe('timelineFromRecipe', () => {
  it('rehydrates a single-trim recipe back into a saveable timeline', () => {
    const recipe: EditRecipe = {
      version: 1,
      sourceVideoId: 'src-1',
      ops: [{ type: 'trim', in: 2, out: 7 }],
      output: { container: 'mp4', mode: 'copy' }
    }
    const t = timelineFromRecipe(recipe, 60)
    expect(isTimelineSaveable(t)).toBe(true)
    expect(t.tracks[0].clips[0].region).toEqual({ inSec: 2, outSec: 7 })
    expect(t.cursorSec).toBe(2)
    expect(t.tracks[0].clips[0].durationSec).toBe(60)
  })

  it('rejects multi-op recipes (v2 territory until the editor lifts the invariant)', () => {
    const recipe: EditRecipe = {
      version: 1,
      sourceVideoId: 'src-1',
      ops: [
        { type: 'trim', in: 0, out: 1 },
        { type: 'trim', in: 2, out: 3 }
      ],
      output: { container: 'mp4', mode: 'copy' }
    }
    expect(() => timelineFromRecipe(recipe, 60)).toThrow(/single op/)
  })

  it('rejects non-trim recipes', () => {
    const recipe: EditRecipe = {
      version: 1,
      sourceVideoId: 'src-1',
      ops: [{ type: 'mute' }],
      output: { container: 'mp4', mode: 'copy' }
    }
    expect(() => timelineFromRecipe(recipe, 60)).toThrow(/trim ops/)
  })
})

describe('round-trip', () => {
  // The pair of pure projections must commute for the MVP-supported
  // shape — phase 7's editor relies on `recipeFromTimeline` round-tripping
  // through `cuts.editRecipeJson`, and v2's "re-edit this cut" feature
  // relies on `timelineFromRecipe` producing the same timeline a fresh
  // session would have built.
  it('recipe → timeline → recipe is the identity for a single trim', () => {
    const original: EditRecipe = {
      version: 1,
      sourceVideoId: 'src-1',
      ops: [{ type: 'trim', in: 3.25, out: 9.75 }],
      output: { container: 'mp4', mode: 'reencode' }
    }
    const restored = recipeFromTimeline(timelineFromRecipe(original, 60), {
      container: 'mp4',
      mode: 'reencode'
    })
    expect(restored).toEqual(original)
  })
})

describe('getActiveClip / updateActiveClip (HP-8)', () => {
  it('getActiveClip returns the only clip on the only track in MVP shape', () => {
    const state = timeline()
    const clip = getActiveClip(state)
    expect(clip).not.toBeNull()
    expect(clip?.id).toBe('clip-0')
    expect(clip?.sourceVideoId).toBe('src-1')
  })

  it('getActiveClip returns null on a state with no tracks (defensive)', () => {
    const state = { ...timeline(), tracks: [] }
    expect(getActiveClip(state)).toBeNull()
  })

  it('updateActiveClip replaces the active clip via the updater', () => {
    const state = timeline()
    const next = updateActiveClip(state, (c) => ({
      ...c,
      region: { inSec: 1, outSec: 5 }
    }))
    expect(next.tracks[0].clips[0].region).toEqual({ inSec: 1, outSec: 5 })
    // Returns a fresh object (immutability check).
    expect(next).not.toBe(state)
    expect(next.tracks[0]).not.toBe(state.tracks[0])
    // Other state slots are untouched.
    expect(next.zoomPxPerSec).toBe(state.zoomPxPerSec)
    expect(next.cursorSec).toBe(state.cursorSec)
  })

  it('updateActiveClip returns the same reference when the updater is a no-op', () => {
    const state = timeline()
    const next = updateActiveClip(state, (c) => c)
    // Identity-preserving optimisation — avoids unnecessary React re-renders.
    expect(next).toBe(state)
  })

  it('updateActiveClip is a no-op when the timeline has no clips', () => {
    const state = { ...timeline(), tracks: [{ id: 'track-0', clips: [] }] }
    const next = updateActiveClip(state, (c) => ({ ...c, durationSec: 999 }))
    expect(next).toBe(state)
  })
})
