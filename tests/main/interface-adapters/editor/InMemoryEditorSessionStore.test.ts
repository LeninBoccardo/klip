import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { InMemoryEditorSessionStore } from '@main/interface-adapters/editor/InMemoryEditorSessionStore'
import type { EditorSessionState } from '@shared/types'
import type { EditRecipe } from '@shared/types'

function makeRecipe(overrides: Partial<EditRecipe> = {}): EditRecipe {
  return {
    version: 1,
    sourceVideoId: 'video-1',
    ops: [{ type: 'trim', in: 0, out: 10 }],
    output: { container: 'mp4', mode: 'copy' },
    ...overrides
  }
}

function makeSession(overrides: Partial<EditorSessionState> = {}): EditorSessionState {
  return {
    jobId: 'job-1',
    cutId: 'cut-1',
    recipe: makeRecipe(),
    status: 'queued',
    percent: null,
    startedAt: '2026-06-17T00:00:00.000Z',
    finishedAt: null,
    errorMessage: null,
    ...overrides
  }
}

describe('InMemoryEditorSessionStore', () => {
  let store: InMemoryEditorSessionStore

  beforeEach(() => {
    store = new InMemoryEditorSessionStore()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('open', () => {
    it('registers a new session retrievable via get', () => {
      const session = makeSession()
      const controller = new AbortController()

      store.open(session, controller)

      expect(store.get('job-1')).toEqual(session)
    })

    it('stores a shallow clone so mutating the input does not affect the registry', () => {
      const session = makeSession({ percent: 0 })
      store.open(session, new AbortController())

      session.percent = 99
      session.status = 'error'

      const snapshot = store.get('job-1')
      expect(snapshot?.percent).toBe(0)
      expect(snapshot?.status).toBe('queued')
    })

    it('throws when opening a session whose jobId is already open', () => {
      const controller = new AbortController()
      store.open(makeSession({ jobId: 'dup' }), controller)

      expect(() => store.open(makeSession({ jobId: 'dup' }), new AbortController())).toThrow(
        'EditorSession dup is already open'
      )
    })

    it('allows distinct jobIds to coexist', () => {
      store.open(makeSession({ jobId: 'a' }), new AbortController())
      store.open(makeSession({ jobId: 'b' }), new AbortController())

      expect(store.get('a')?.jobId).toBe('a')
      expect(store.get('b')?.jobId).toBe('b')
    })
  })

  describe('get', () => {
    it('returns null for an unknown jobId', () => {
      expect(store.get('missing')).toBeNull()
    })

    it('returns a fresh clone on each call so callers cannot mutate the registry', () => {
      store.open(makeSession({ percent: 5 }), new AbortController())

      const first = store.get('job-1')
      expect(first).not.toBeNull()
      first!.percent = 50

      const second = store.get('job-1')
      expect(second?.percent).toBe(5)
      expect(first).not.toBe(second)
    })
  })

  describe('getAbortController', () => {
    it('returns null for an unknown jobId', () => {
      expect(store.getAbortController('missing')).toBeNull()
    })

    it('returns the exact controller instance passed to open', () => {
      const controller = new AbortController()
      store.open(makeSession(), controller)

      expect(store.getAbortController('job-1')).toBe(controller)
    })

    it('returns a controller whose abort signal is wired through', () => {
      const controller = new AbortController()
      store.open(makeSession(), controller)

      const got = store.getAbortController('job-1')
      expect(got?.signal.aborted).toBe(false)
      got?.abort()
      expect(controller.signal.aborted).toBe(true)
    })
  })

  describe('update', () => {
    it('is a no-op for an unknown jobId', () => {
      expect(() => store.update('missing', { status: 'rendering' })).not.toThrow()
      expect(store.get('missing')).toBeNull()
    })

    it('updates status when provided', () => {
      store.open(makeSession(), new AbortController())
      store.update('job-1', { status: 'rendering' })
      expect(store.get('job-1')?.status).toBe('rendering')
    })

    it('updates percent when provided (including 0)', () => {
      store.open(makeSession({ percent: null }), new AbortController())
      store.update('job-1', { percent: 0 })
      expect(store.get('job-1')?.percent).toBe(0)

      store.update('job-1', { percent: 42 })
      expect(store.get('job-1')?.percent).toBe(42)
    })

    it('updates percent to null when explicitly set to null', () => {
      store.open(makeSession({ percent: 30 }), new AbortController())
      store.update('job-1', { percent: null })
      expect(store.get('job-1')?.percent).toBeNull()
    })

    it('updates errorMessage when provided (including null)', () => {
      store.open(makeSession({ errorMessage: 'old' }), new AbortController())
      store.update('job-1', { errorMessage: 'boom' })
      expect(store.get('job-1')?.errorMessage).toBe('boom')

      store.update('job-1', { errorMessage: null })
      expect(store.get('job-1')?.errorMessage).toBeNull()
    })

    it('leaves fields untouched when their patch keys are omitted (undefined)', () => {
      store.open(
        makeSession({ status: 'rendering', percent: 12, errorMessage: 'keep' }),
        new AbortController()
      )

      store.update('job-1', {})

      const snapshot = store.get('job-1')
      expect(snapshot?.status).toBe('rendering')
      expect(snapshot?.percent).toBe(12)
      expect(snapshot?.errorMessage).toBe('keep')
    })

    it('applies status, percent and errorMessage together in one patch', () => {
      store.open(makeSession(), new AbortController())

      store.update('job-1', { status: 'error', percent: 77, errorMessage: 'fail' })

      const snapshot = store.get('job-1')
      expect(snapshot?.status).toBe('error')
      expect(snapshot?.percent).toBe(77)
      expect(snapshot?.errorMessage).toBe('fail')
    })

    it('explicitly passing undefined values does not overwrite existing fields', () => {
      store.open(
        makeSession({ status: 'finalizing', percent: 90, errorMessage: 'prev' }),
        new AbortController()
      )

      store.update('job-1', { status: undefined, percent: undefined, errorMessage: undefined })

      const snapshot = store.get('job-1')
      expect(snapshot?.status).toBe('finalizing')
      expect(snapshot?.percent).toBe(90)
      expect(snapshot?.errorMessage).toBe('prev')
    })
  })

  describe('finalize', () => {
    it('is a no-op for an unknown jobId', () => {
      expect(() => store.finalize('missing', 'complete')).not.toThrow()
      expect(store.get('missing')).toBeNull()
    })

    it('marks status complete, stamps finishedAt and forces percent to 100', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-17T12:34:56.000Z'))

      store.open(makeSession({ percent: 50, finishedAt: null }), new AbortController())
      store.finalize('job-1', 'complete')

      const snapshot = store.get('job-1')
      expect(snapshot?.status).toBe('complete')
      expect(snapshot?.percent).toBe(100)
      expect(snapshot?.finishedAt).toBe('2026-06-17T12:34:56.000Z')
      expect(snapshot?.errorMessage).toBeNull()
    })

    it('marks status error and records the error message', () => {
      store.open(makeSession({ percent: 33 }), new AbortController())
      store.finalize('job-1', 'error', 'render exploded')

      const snapshot = store.get('job-1')
      expect(snapshot?.status).toBe('error')
      expect(snapshot?.errorMessage).toBe('render exploded')
      // percent is NOT forced to 100 for non-complete terminal states
      expect(snapshot?.percent).toBe(33)
      expect(snapshot?.finishedAt).not.toBeNull()
    })

    it('marks status cancelled without forcing percent', () => {
      store.open(makeSession({ percent: 60 }), new AbortController())
      store.finalize('job-1', 'cancelled')

      const snapshot = store.get('job-1')
      expect(snapshot?.status).toBe('cancelled')
      expect(snapshot?.percent).toBe(60)
      expect(snapshot?.finishedAt).not.toBeNull()
    })

    it('leaves errorMessage untouched when the argument is omitted', () => {
      store.open(makeSession({ errorMessage: 'existing' }), new AbortController())
      store.finalize('job-1', 'error')

      expect(store.get('job-1')?.errorMessage).toBe('existing')
    })

    it('clears errorMessage when explicitly passed undefined keeps prior value, but a string overwrites', () => {
      store.open(makeSession({ errorMessage: 'old' }), new AbortController())
      // explicit undefined -> not overwritten
      store.finalize('job-1', 'cancelled', undefined)
      expect(store.get('job-1')?.errorMessage).toBe('old')
    })

    it('produces a valid ISO 8601 finishedAt timestamp', () => {
      store.open(makeSession({ finishedAt: null }), new AbortController())
      store.finalize('job-1', 'complete')

      const finishedAt = store.get('job-1')?.finishedAt
      expect(finishedAt).toBeTruthy()
      expect(() => new Date(finishedAt as string).toISOString()).not.toThrow()
      expect(new Date(finishedAt as string).toISOString()).toBe(finishedAt)
    })
  })

  describe('list', () => {
    it('returns an empty array when no sessions are open', () => {
      expect(store.list()).toEqual([])
    })

    it('returns every open session', () => {
      store.open(makeSession({ jobId: 'a' }), new AbortController())
      store.open(makeSession({ jobId: 'b' }), new AbortController())

      const list = store.list()
      expect(list).toHaveLength(2)
      expect(list.map((s) => s.jobId).sort()).toEqual(['a', 'b'])
    })

    it('returns clones so mutating list entries does not affect the registry', () => {
      store.open(makeSession({ jobId: 'a', percent: 1 }), new AbortController())

      const list = store.list()
      list[0].percent = 999

      expect(store.get('a')?.percent).toBe(1)
    })
  })

  describe('remove', () => {
    it('removes an existing session so get returns null afterwards', () => {
      store.open(makeSession(), new AbortController())
      expect(store.get('job-1')).not.toBeNull()

      store.remove('job-1')

      expect(store.get('job-1')).toBeNull()
      expect(store.getAbortController('job-1')).toBeNull()
      expect(store.list()).toEqual([])
    })

    it('is a no-op for an unknown jobId', () => {
      store.open(makeSession({ jobId: 'keep' }), new AbortController())

      expect(() => store.remove('missing')).not.toThrow()
      expect(store.get('keep')).not.toBeNull()
    })

    it('allows reopening a jobId after it has been removed', () => {
      store.open(makeSession({ jobId: 'reuse' }), new AbortController())
      store.remove('reuse')

      expect(() => store.open(makeSession({ jobId: 'reuse' }), new AbortController())).not.toThrow()
      expect(store.get('reuse')?.jobId).toBe('reuse')
    })
  })

  it('supports a full lifecycle: open -> update -> finalize -> remove', () => {
    const controller = new AbortController()
    store.open(makeSession({ jobId: 'lifecycle', status: 'queued', percent: null }), controller)

    store.update('lifecycle', { status: 'rendering', percent: 25 })
    expect(store.get('lifecycle')?.status).toBe('rendering')
    expect(store.get('lifecycle')?.percent).toBe(25)

    store.update('lifecycle', { status: 'finalizing', percent: 95 })
    expect(store.get('lifecycle')?.status).toBe('finalizing')

    store.finalize('lifecycle', 'complete')
    const done = store.get('lifecycle')
    expect(done?.status).toBe('complete')
    expect(done?.percent).toBe(100)
    expect(done?.finishedAt).not.toBeNull()

    store.remove('lifecycle')
    expect(store.get('lifecycle')).toBeNull()
  })
})
