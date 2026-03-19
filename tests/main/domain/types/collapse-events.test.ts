import { describe, it, expect } from 'vitest'
import { collapseEvents } from '@domain/types'
import type { FileEvent } from '@domain/types'

// ── Helper ──

function ev(type: FileEvent['type'], path: string): FileEvent {
  return { type, path }
}

describe('collapseEvents', () => {
  // ── Edge cases ──

  it('returns empty array for empty input', () => {
    expect(collapseEvents([])).toEqual([])
  })

  it('passes through a single event unchanged', () => {
    expect(collapseEvents([ev('add', '/a')])).toEqual([ev('add', '/a')])
  })

  // ── File × File ──

  describe('file × file collapsing', () => {
    it('add → add = add (duplicate)', () => {
      expect(collapseEvents([ev('add', '/f'), ev('add', '/f')])).toEqual([ev('add', '/f')])
    })

    it('add → change = add (still just created)', () => {
      expect(collapseEvents([ev('add', '/f'), ev('change', '/f')])).toEqual([ev('add', '/f')])
    })

    it('add → unlink = IGNORE (transient)', () => {
      expect(collapseEvents([ev('add', '/f'), ev('unlink', '/f')])).toEqual([])
    })

    it('change → change = change (latest wins)', () => {
      expect(collapseEvents([ev('change', '/f'), ev('change', '/f')])).toEqual([ev('change', '/f')])
    })

    it('change → unlink = unlink (file removed)', () => {
      expect(collapseEvents([ev('change', '/f'), ev('unlink', '/f')])).toEqual([ev('unlink', '/f')])
    })

    it('unlink → add = change (delete → recreate)', () => {
      expect(collapseEvents([ev('unlink', '/f'), ev('add', '/f')])).toEqual([ev('change', '/f')])
    })

    it('unlink → change = change (treat as recreate)', () => {
      expect(collapseEvents([ev('unlink', '/f'), ev('change', '/f')])).toEqual([ev('change', '/f')])
    })

    it('unlink → unlink = unlink (duplicate)', () => {
      expect(collapseEvents([ev('unlink', '/f'), ev('unlink', '/f')])).toEqual([ev('unlink', '/f')])
    })
  })

  // ── Dir × Dir ──

  describe('dir × dir collapsing', () => {
    it('addDir → addDir = addDir (duplicate)', () => {
      expect(collapseEvents([ev('addDir', '/d'), ev('addDir', '/d')])).toEqual([ev('addDir', '/d')])
    })

    it('addDir → unlinkDir = IGNORE (transient)', () => {
      expect(collapseEvents([ev('addDir', '/d'), ev('unlinkDir', '/d')])).toEqual([])
    })

    it('unlinkDir → addDir = change (recreated)', () => {
      expect(collapseEvents([ev('unlinkDir', '/d'), ev('addDir', '/d')])).toEqual([
        ev('change', '/d')
      ])
    })

    it('unlinkDir → unlinkDir = unlinkDir (duplicate)', () => {
      expect(collapseEvents([ev('unlinkDir', '/d'), ev('unlinkDir', '/d')])).toEqual([
        ev('unlinkDir', '/d')
      ])
    })
  })

  // ── Mixed (dir ↔ file): directory dominates ──

  describe('mixed dir ↔ file collapsing', () => {
    it('addDir → add = addDir (dir dominates)', () => {
      expect(collapseEvents([ev('addDir', '/p'), ev('add', '/p')])).toEqual([ev('addDir', '/p')])
    })

    it('add → addDir = addDir (dir replaces file)', () => {
      expect(collapseEvents([ev('add', '/p'), ev('addDir', '/p')])).toEqual([ev('addDir', '/p')])
    })

    it('unlinkDir → unlink = unlinkDir (dir dominates)', () => {
      expect(collapseEvents([ev('unlinkDir', '/p'), ev('unlink', '/p')])).toEqual([
        ev('unlinkDir', '/p')
      ])
    })

    it('unlink → unlinkDir = unlinkDir (dir dominates)', () => {
      expect(collapseEvents([ev('unlink', '/p'), ev('unlinkDir', '/p')])).toEqual([
        ev('unlinkDir', '/p')
      ])
    })
  })

  // ── Multi-step collapsing (3+ events on same path) ──

  describe('multi-step collapsing', () => {
    it('add → change → unlink = IGNORE (add→change=add, then add→unlink=null)', () => {
      expect(collapseEvents([ev('add', '/f'), ev('change', '/f'), ev('unlink', '/f')])).toEqual([])
    })

    it('unlink → add → unlink → add = change', () => {
      // unlink→add=change, change→unlink=unlink, unlink→add=change
      expect(
        collapseEvents([ev('unlink', '/f'), ev('add', '/f'), ev('unlink', '/f'), ev('add', '/f')])
      ).toEqual([ev('change', '/f')])
    })

    it('add → unlink → add = add (IGNORE clears, then fresh add)', () => {
      // add→unlink=null (path removed), then add restarts as fresh
      expect(collapseEvents([ev('add', '/f'), ev('unlink', '/f'), ev('add', '/f')])).toEqual([
        ev('add', '/f')
      ])
    })

    it('addDir → unlinkDir → addDir = addDir (IGNORE clears, then fresh addDir)', () => {
      expect(
        collapseEvents([ev('addDir', '/d'), ev('unlinkDir', '/d'), ev('addDir', '/d')])
      ).toEqual([ev('addDir', '/d')])
    })
  })

  // ── Multi-path (events for different paths don't interfere) ──

  describe('multi-path independence', () => {
    it('events on separate paths collapse independently', () => {
      const result = collapseEvents([
        ev('add', '/a'),
        ev('unlink', '/b'),
        ev('change', '/a'), // add→change=add
        ev('add', '/b') //    unlink→add=change
      ])
      expect(result).toEqual([ev('add', '/a'), ev('change', '/b')])
    })

    it('IGNORE on one path does not affect another', () => {
      const result = collapseEvents([
        ev('add', '/x'),
        ev('change', '/y'),
        ev('unlink', '/x') // add→unlink=null → /x removed
      ])
      expect(result).toEqual([ev('change', '/y')])
    })
  })

  // ── Unlisted combinations fall back to latest event ──

  describe('unlisted combination fallback', () => {
    it('change → add = add (not in table, latest wins)', () => {
      expect(collapseEvents([ev('change', '/f'), ev('add', '/f')])).toEqual([ev('add', '/f')])
    })

    it('change → addDir = addDir (not in table, latest wins)', () => {
      expect(collapseEvents([ev('change', '/f'), ev('addDir', '/f')])).toEqual([ev('addDir', '/f')])
    })
  })
})
