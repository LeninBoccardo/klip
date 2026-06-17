import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from '@/hooks/use-editor-store'

// Reset to a known state before each test — Zustand stores leak across
// tests by default since they're module-level singletons.
function resetStore(): void {
  useEditorStore.setState({
    sourceVideoId: null,
    sourceTitle: null,
    sourceCreatorName: null,
    timeline: null,
    renderMode: 'copy',
    activeJobId: null,
    activeJobCutId: null,
    activeJobStatus: null,
    activeJobPercent: null,
    activeJobError: null
  })
}

const SEED = {
  sourceVideoId: 'abc',
  sourceTitle: 'Test source',
  sourceCreatorName: 'Test creator',
  durationSec: 30
} as const

describe('useEditorStore — initSourceVideo', () => {
  beforeEach(resetStore)

  it('seeds a graph-shaped timeline from a source id + duration', () => {
    useEditorStore.getState().initSourceVideo(SEED)
    const s = useEditorStore.getState()
    expect(s.sourceVideoId).toBe('abc')
    expect(s.timeline?.tracks[0].clips[0].sourceVideoId).toBe('abc')
    expect(s.timeline?.tracks[0].clips[0].durationSec).toBe(30)
  })

  it('clears any stale active-job mirror when a new source loads', () => {
    useEditorStore.setState({
      activeJobId: 'job-1',
      activeJobCutId: 'cut-1',
      activeJobStatus: 'rendering',
      activeJobPercent: 50,
      activeJobError: 'old error'
    })
    useEditorStore.getState().initSourceVideo(SEED)
    const s = useEditorStore.getState()
    expect(s.activeJobId).toBeNull()
    expect(s.activeJobCutId).toBeNull()
    expect(s.activeJobStatus).toBeNull()
    expect(s.activeJobPercent).toBeNull()
    expect(s.activeJobError).toBeNull()
  })
})

describe('useEditorStore — in/out point clamping', () => {
  beforeEach(() => {
    resetStore()
    useEditorStore.getState().initSourceVideo(SEED)
  })

  it('clamps a below-zero in-point to 0', () => {
    useEditorStore.getState().setInPoint(-5)
    expect(useEditorStore.getState().timeline?.tracks[0].clips[0].region?.inSec).toBe(0)
  })

  it('clamps a below-zero out-point gracefully (refuses if it would invert)', () => {
    useEditorStore.getState().setOutPoint(-5)
    // Without an existing in-point, default in is 0 → out clamped to 0 →
    // no room for a region; the call is refused and region stays null.
    expect(useEditorStore.getState().timeline?.tracks[0].clips[0].region).toBeNull()
  })

  it('clamps an over-duration out-point to duration', () => {
    useEditorStore.getState().setOutPoint(100)
    expect(useEditorStore.getState().timeline?.tracks[0].clips[0].region?.outSec).toBe(30)
  })

  it('seeds a saveable region from a single in-point (out defaults to end of clip)', () => {
    // F76: the success path reports true so the caller knows not to toast.
    expect(useEditorStore.getState().setInPoint(5)).toBe(true)
    expect(useEditorStore.getState().timeline?.tracks[0].clips[0].region).toEqual({
      inSec: 5,
      outSec: 30
    })
  })

  it('seeds a saveable region from a single out-point (in defaults to start of clip)', () => {
    expect(useEditorStore.getState().setOutPoint(20)).toBe(true)
    expect(useEditorStore.getState().timeline?.tracks[0].clips[0].region).toEqual({
      inSec: 0,
      outSec: 20
    })
  })

  it('preserves an existing out-point when the new in-point is below it', () => {
    useEditorStore.getState().setOutPoint(20)
    useEditorStore.getState().setInPoint(5)
    expect(useEditorStore.getState().timeline?.tracks[0].clips[0].region).toEqual({
      inSec: 5,
      outSec: 20
    })
  })

  it('preserves an existing in-point when the new out-point is above it', () => {
    useEditorStore.getState().setInPoint(5)
    useEditorStore.getState().setOutPoint(15)
    expect(useEditorStore.getState().timeline?.tracks[0].clips[0].region).toEqual({
      inSec: 5,
      outSec: 15
    })
  })

  // ── Silent-clobber regression tests (HP-5) ──

  it('refuses an in-point at-or-past the existing out-point (does not destroy it)', () => {
    useEditorStore.getState().setOutPoint(5)
    // User now tries to mark in at 7, which would invert the region.
    // Earlier behaviour silently set out to 7.001, destroying the user's 5.
    // The mutator now reports the refusal so EditorView can toast (F76).
    expect(useEditorStore.getState().setInPoint(7)).toBe(false)
    expect(useEditorStore.getState().timeline?.tracks[0].clips[0].region).toEqual({
      inSec: 0,
      outSec: 5
    })
  })

  it('refuses an out-point at-or-before the existing in-point (does not destroy it)', () => {
    useEditorStore.getState().setInPoint(10)
    expect(useEditorStore.getState().setOutPoint(3)).toBe(false)
    expect(useEditorStore.getState().timeline?.tracks[0].clips[0].region).toEqual({
      inSec: 10,
      outSec: 30
    })
  })

  it('refuses an in-point exactly at the existing out-point (collapse)', () => {
    useEditorStore.getState().setOutPoint(10)
    expect(useEditorStore.getState().setInPoint(10)).toBe(false)
    expect(useEditorStore.getState().timeline?.tracks[0].clips[0].region).toEqual({
      inSec: 0,
      outSec: 10
    })
  })

  it('refuses an in-point at the very end of the clip (no room for out)', () => {
    // Without an existing out, in=duration would synthesise an unsaveable
    // out=duration+ε. The new behaviour refuses the mark instead.
    expect(useEditorStore.getState().setInPoint(30)).toBe(false)
    expect(useEditorStore.getState().timeline?.tracks[0].clips[0].region).toBeNull()
  })

  it('refuses an out-point at 0 with no existing in (no room for in)', () => {
    expect(useEditorStore.getState().setOutPoint(0)).toBe(false)
    expect(useEditorStore.getState().timeline?.tracks[0].clips[0].region).toBeNull()
  })

  it('clearRegion drops the region but keeps the rest of the timeline state', () => {
    useEditorStore.getState().setInPoint(2)
    useEditorStore.getState().setOutPoint(10)
    useEditorStore.getState().clearRegion()
    const t = useEditorStore.getState().timeline
    expect(t?.tracks[0].clips[0].region).toBeNull()
    // Source + duration must survive the clear — the user is starting
    // a new selection on the same source, not loading a new one.
    expect(t?.tracks[0].clips[0].sourceVideoId).toBe('abc')
    expect(t?.tracks[0].clips[0].durationSec).toBe(30)
  })
})

describe('useEditorStore — job-mirror filtering', () => {
  beforeEach(resetStore)

  it('beginTracking seeds the mirror at status=queued, percent=null', () => {
    useEditorStore.getState().beginTracking({ jobId: 'job-1', cutId: 'cut-1' })
    const s = useEditorStore.getState()
    expect(s.activeJobId).toBe('job-1')
    expect(s.activeJobCutId).toBe('cut-1')
    expect(s.activeJobStatus).toBe('queued')
    expect(s.activeJobPercent).toBeNull()
    expect(s.activeJobError).toBeNull()
  })

  it('updateJob applies events for the active job', () => {
    useEditorStore.getState().beginTracking({ jobId: 'job-1', cutId: 'cut-1' })
    useEditorStore
      .getState()
      .updateJob({ jobId: 'job-1', status: 'rendering', percent: 42, errorMessage: undefined })
    const s = useEditorStore.getState()
    expect(s.activeJobStatus).toBe('rendering')
    expect(s.activeJobPercent).toBe(42)
  })

  it('updateJob ignores events for a different job (stale events from prior renders)', () => {
    useEditorStore.getState().beginTracking({ jobId: 'job-1', cutId: 'cut-1' })
    useEditorStore.getState().updateJob({ jobId: 'job-OLD', status: 'rendering', percent: 99 })
    const s = useEditorStore.getState()
    // Status must remain 'queued' from beginTracking — the stale event
    // is dropped instead of overwriting the active mirror.
    expect(s.activeJobStatus).toBe('queued')
    expect(s.activeJobPercent).toBeNull()
  })

  it('clearJob resets the mirror so the next render starts clean', () => {
    useEditorStore.getState().beginTracking({ jobId: 'job-1', cutId: 'cut-1' })
    useEditorStore.getState().updateJob({ jobId: 'job-1', status: 'complete', percent: 100 })
    useEditorStore.getState().clearJob()
    const s = useEditorStore.getState()
    expect(s.activeJobId).toBeNull()
    expect(s.activeJobStatus).toBeNull()
    expect(s.activeJobPercent).toBeNull()
  })
})

describe('useEditorStore — render mode', () => {
  beforeEach(resetStore)

  it('defaults to copy (the killer "instant trim" property from plan §8.Q1)', () => {
    expect(useEditorStore.getState().renderMode).toBe('copy')
  })

  it('flips to reencode and back', () => {
    useEditorStore.getState().setRenderMode('reencode')
    expect(useEditorStore.getState().renderMode).toBe('reencode')
    useEditorStore.getState().setRenderMode('copy')
    expect(useEditorStore.getState().renderMode).toBe('copy')
  })
})
