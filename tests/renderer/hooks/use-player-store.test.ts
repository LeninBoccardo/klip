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

describe('usePlayerStore queue', () => {
  it('playQueue loads items and starts at the supplied index', () => {
    act(() => {
      usePlayerStore.getState().playQueue(
        [
          { kind: 'video', id: 'v-1', title: 'A' },
          { kind: 'cut', id: 'cut-1', title: 'B' },
          { kind: 'video', id: 'v-2', title: 'C' }
        ],
        1
      )
    })

    const s = usePlayerStore.getState()
    expect(s.queue?.index).toBe(1)
    expect(s.videoId).toBe('cut-1')
    expect(s.mediaKind).toBe('cut')
    expect(s.title).toBe('B')
    expect(s.mode).toBe('detail')
  })

  it('playQueue is a no-op for an empty list', () => {
    act(() => {
      usePlayerStore.getState().playQueue([])
    })
    expect(usePlayerStore.getState().queue).toBeNull()
    expect(usePlayerStore.getState().mode).toBe('idle')
  })

  it('playQueue clamps an out-of-range startIndex into [0, length)', () => {
    act(() => {
      usePlayerStore.getState().playQueue(
        [
          { kind: 'video', id: 'v-1', title: 'A' },
          { kind: 'video', id: 'v-2', title: 'B' }
        ],
        99
      )
    })
    expect(usePlayerStore.getState().queue?.index).toBe(1)
    expect(usePlayerStore.getState().videoId).toBe('v-2')
  })

  it('next() advances the index and swaps the loaded item', () => {
    act(() => {
      usePlayerStore.getState().playQueue([
        { kind: 'video', id: 'v-1', title: 'A' },
        { kind: 'cut', id: 'cut-1', title: 'B' }
      ])
    })
    act(() => usePlayerStore.getState().next())

    const s = usePlayerStore.getState()
    expect(s.queue?.index).toBe(1)
    expect(s.videoId).toBe('cut-1')
    expect(s.mediaKind).toBe('cut')
  })

  it('next() at the last item clears the queue and stops the player', () => {
    act(() => {
      usePlayerStore.getState().playQueue([{ kind: 'video', id: 'v-1', title: 'A' }])
    })
    act(() => usePlayerStore.getState().next())

    const s = usePlayerStore.getState()
    expect(s.queue).toBeNull()
    expect(s.videoId).toBeNull()
    expect(s.mode).toBe('idle')
  })

  it('previous() steps back and is a no-op at index 0', () => {
    act(() => {
      usePlayerStore.getState().playQueue(
        [
          { kind: 'video', id: 'v-1', title: 'A' },
          { kind: 'video', id: 'v-2', title: 'B' }
        ],
        1
      )
    })

    act(() => usePlayerStore.getState().previous())
    expect(usePlayerStore.getState().queue?.index).toBe(0)
    expect(usePlayerStore.getState().videoId).toBe('v-1')

    // Already at index 0 — should not underflow.
    act(() => usePlayerStore.getState().previous())
    expect(usePlayerStore.getState().queue?.index).toBe(0)
  })

  it('clearQueue drops the queue but preserves the playing item', () => {
    act(() => {
      usePlayerStore.getState().playQueue([{ kind: 'video', id: 'v-1', title: 'A' }])
    })
    act(() => usePlayerStore.getState().clearQueue())

    const s = usePlayerStore.getState()
    expect(s.queue).toBeNull()
    expect(s.videoId).toBe('v-1')
    expect(s.mode).toBe('detail')
  })

  it('stop() clears the queue alongside the player state', () => {
    act(() => {
      usePlayerStore.getState().playQueue([{ kind: 'video', id: 'v-1', title: 'A' }])
      usePlayerStore.getState().stop()
    })
    expect(usePlayerStore.getState().queue).toBeNull()
    expect(usePlayerStore.getState().videoId).toBeNull()
  })

  it('next/previous are no-ops when no queue is loaded', () => {
    const before = usePlayerStore.getState()
    act(() => usePlayerStore.getState().next())
    act(() => usePlayerStore.getState().previous())
    expect(usePlayerStore.getState()).toEqual(before)
  })
})
