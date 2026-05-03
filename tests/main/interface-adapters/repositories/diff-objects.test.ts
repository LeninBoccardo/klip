import { describe, it, expect } from 'vitest'
import { diffObjects } from '@main/interface-adapters/repositories/diff-objects'

// `diffObjects` feeds the audit log; a regression here silently corrupts the
// trail. The repos call it with full domain entities — these cases pin the
// shape audit consumers actually rely on.
describe('diffObjects', () => {
  it('returns null when the objects are identical', () => {
    expect(diffObjects({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBeNull()
  })

  it('returns a JSON object with old/new pairs for changed fields', () => {
    const out = diffObjects({ name: 'old', count: 1 }, { name: 'new', count: 1 })
    expect(out).not.toBeNull()
    expect(JSON.parse(out!)).toEqual({
      name: { old: 'old', new: 'new' }
    })
  })

  it('detects a field added in the new object', () => {
    const out = diffObjects({ a: 1 }, { a: 1, b: 2 })
    expect(JSON.parse(out!)).toEqual({ b: { old: undefined, new: 2 } })
  })

  it('does not detect a field removed in the new object (iterates new keys)', () => {
    // Documented behavior: diffObjects iterates `Object.keys(newObj)`. Audit
    // consumers rely on this — domain entities have stable shapes (every
    // field is always present, just nullable), so removed keys never appear
    // in practice.
    expect(diffObjects({ a: 1, b: 2 }, { a: 1 })).toBeNull()
  })

  it('skips updatedAt even when it changed', () => {
    expect(
      diffObjects(
        { name: 'x', updatedAt: '2026-01-01T00:00:00Z' },
        { name: 'x', updatedAt: '2026-05-02T00:00:00Z' }
      )
    ).toBeNull()
  })

  it('reports changes in fields other than updatedAt even when updatedAt also changed', () => {
    const out = diffObjects(
      { name: 'old', updatedAt: '2026-01-01T00:00:00Z' },
      { name: 'new', updatedAt: '2026-05-02T00:00:00Z' }
    )
    expect(JSON.parse(out!)).toEqual({ name: { old: 'old', new: 'new' } })
  })

  it('treats null and undefined as distinct', () => {
    // JSON.stringify(null) === 'null', JSON.stringify(undefined) === undefined,
    // so the inequality check fires. The serialized output drops `new: undefined`
    // but the diff entry itself is recorded.
    const out = diffObjects({ a: null }, { a: undefined })
    expect(out).not.toBeNull()
    expect(JSON.parse(out!)).toEqual({ a: { old: null } })
  })

  it('detects array contents change (uses JSON equality)', () => {
    const out = diffObjects({ tags: ['a', 'b'] }, { tags: ['a', 'c'] })
    expect(JSON.parse(out!)).toEqual({ tags: { old: ['a', 'b'], new: ['a', 'c'] } })
  })

  it('treats array order as significant', () => {
    const out = diffObjects({ tags: ['a', 'b'] }, { tags: ['b', 'a'] })
    expect(out).not.toBeNull()
  })

  it('detects nested object change via JSON equality', () => {
    const out = diffObjects({ meta: { resolution: '720p' } }, { meta: { resolution: '1080p' } })
    expect(JSON.parse(out!)).toEqual({
      meta: { old: { resolution: '720p' }, new: { resolution: '1080p' } }
    })
  })

  it('returns the changes for multiple fields together', () => {
    const out = diffObjects({ a: 1, b: 2, c: 3 }, { a: 1, b: 20, c: 30 })
    expect(JSON.parse(out!)).toEqual({
      b: { old: 2, new: 20 },
      c: { old: 3, new: 30 }
    })
  })

  it('handles two empty objects', () => {
    expect(diffObjects({}, {})).toBeNull()
  })
})
