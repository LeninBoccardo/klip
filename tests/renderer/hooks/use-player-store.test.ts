import { describe, it, expect, beforeEach } from 'vitest'
import { act } from '@testing-library/react'
import { usePlayerStore } from '@/hooks/use-player-store'

beforeEach(() => {
  // Reset between tests so a previous case can't leak playback state.
  act(() => {
    usePlayerStore.getState().stop()
    usePlayerStore.getState().setNavBehavior('floating')
  })
})

describe('usePlayerStore', () => {
  it('starts idle with no loaded video', () => {
    const s = usePlayerStore.getState()
    expect(s.videoId).toBeNull()
    expect(s.mode).toBe('idle')
    expect(s.resumeAt).toBe(0)
  })

  it('play() sets videoId, title, mode, and resets resumeAt for a new video', () => {
    act(() => {
      usePlayerStore.getState().reportTime(45)
    })

    act(() => {
      usePlayerStore.getState().play({ videoId: 'v-1', title: 'A' })
    })
    expect(usePlayerStore.getState().videoId).toBe('v-1')
    expect(usePlayerStore.getState().title).toBe('A')
    expect(usePlayerStore.getState().mode).toBe('detail')
    // The 45s came from a previous (un-set) video; new id resets resumeAt.
    expect(usePlayerStore.getState().resumeAt).toBe(0)
  })

  it('play() with the same videoId preserves resumeAt for resume-on-return', () => {
    act(() => {
      usePlayerStore.getState().play({ videoId: 'v-1', title: 'A' })
      usePlayerStore.getState().reportTime(60)
    })
    act(() => {
      usePlayerStore.getState().play({ videoId: 'v-1', title: 'A', mode: 'detail' })
    })
    expect(usePlayerStore.getState().resumeAt).toBeGreaterThanOrEqual(60)
  })

  it('play() with a different videoId resets resumeAt to zero', () => {
    act(() => {
      usePlayerStore.getState().play({ videoId: 'v-1', title: 'A' })
      usePlayerStore.getState().reportTime(120)
    })
    act(() => {
      usePlayerStore.getState().play({ videoId: 'v-2', title: 'B' })
    })
    expect(usePlayerStore.getState().resumeAt).toBe(0)
  })

  it('reportTime() coalesces sub-second updates to whole seconds', () => {
    act(() => {
      usePlayerStore.getState().play({ videoId: 'v-1', title: 'A' })
    })

    act(() => {
      usePlayerStore.getState().reportTime(10.1)
    })
    expect(usePlayerStore.getState().resumeAt).toBe(10.1)

    // Same whole-second bucket → state should not change reference.
    const before = usePlayerStore.getState()
    act(() => {
      usePlayerStore.getState().reportTime(10.4)
    })
    expect(usePlayerStore.getState()).toBe(before)
  })

  it('setMode() flips attachment without altering loaded media', () => {
    act(() => {
      usePlayerStore.getState().play({ videoId: 'v-1', title: 'A' })
      usePlayerStore.getState().setMode('mini')
    })
    expect(usePlayerStore.getState().mode).toBe('mini')
    expect(usePlayerStore.getState().videoId).toBe('v-1')
  })

  it('stop() clears videoId, title, mode, and resumeAt', () => {
    act(() => {
      usePlayerStore.getState().play({ videoId: 'v-1', title: 'A' })
      usePlayerStore.getState().reportTime(30)
      usePlayerStore.getState().stop()
    })
    const s = usePlayerStore.getState()
    expect(s.videoId).toBeNull()
    expect(s.title).toBeNull()
    expect(s.mode).toBe('idle')
    expect(s.resumeAt).toBe(0)
  })

  it("setNavBehavior() updates the mirrored 'playbackOnNavigate' value", () => {
    act(() => {
      usePlayerStore.getState().setNavBehavior('pause')
    })
    expect(usePlayerStore.getState().navBehavior).toBe('pause')
  })
})
