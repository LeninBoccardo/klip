import { describe, it, expect } from 'vitest'
import { queryKeys } from '@/lib/query-keys'

// Cache invalidation depends on these keys being structurally stable. A
// regression that re-orders the tuple or drops the namespace prefix would
// silently miss invalidations across the app — every list view caches off
// these keys.

describe('queryKeys', () => {
  describe('creators', () => {
    it('exposes a stable parameterless key for the namespace', () => {
      expect(queryKeys.creators.all).toEqual(['creators'])
      // Reference stability matters because some `invalidateQueries({ queryKey })`
      // sites take the key by reference; if the array were re-allocated each
      // access, naive equality checks would break. (Frozen via `as const`.)
      expect(queryKeys.creators.all).toBe(queryKeys.creators.all)
    })

    it('builds list keys that include the params object', () => {
      const params = { page: 1, pageSize: 10 }
      expect(queryKeys.creators.list(params)).toEqual(['creators', 'list', params])
    })

    it('detail key includes the id', () => {
      expect(queryKeys.creators.detail('c-1')).toEqual(['creators', 'detail', 'c-1'])
    })

    it('produces distinct keys for distinct params (cache-miss safety)', () => {
      const a = queryKeys.creators.list({ page: 1, pageSize: 10 })
      const b = queryKeys.creators.list({ page: 2, pageSize: 10 })
      expect(a).not.toEqual(b)
      const c = queryKeys.creators.detail('c-1')
      const d = queryKeys.creators.detail('c-2')
      expect(c).not.toEqual(d)
    })
  })

  describe('videos', () => {
    it('exposes namespace + list + detail + transcript + comments', () => {
      expect(queryKeys.videos.all).toEqual(['videos'])
      expect(queryKeys.videos.list({ page: 1, pageSize: 10 })).toEqual([
        'videos',
        'list',
        { page: 1, pageSize: 10 }
      ])
      expect(queryKeys.videos.detail('v-1')).toEqual(['videos', 'detail', 'v-1'])
      expect(queryKeys.videos.transcript('v-1')).toEqual(['videos', 'transcript', 'v-1'])
      expect(queryKeys.videos.comments('v-1', 200)).toEqual(['videos', 'comments', 'v-1', 200])
    })

    it('comments key segregates by maxComments (different cache slots)', () => {
      const a = queryKeys.videos.comments('v-1', 200)
      const b = queryKeys.videos.comments('v-1', 500)
      expect(a).not.toEqual(b)
    })
  })

  describe('cuts', () => {
    it('exposes namespace + paginated list key', () => {
      expect(queryKeys.cuts.all).toEqual(['cuts'])
      const params = { page: 1, pageSize: 50 }
      expect(queryKeys.cuts.list(params)).toEqual(['cuts', 'list', params])
    })
  })

  describe('settings', () => {
    it('exposes namespace + per-key detail', () => {
      expect(queryKeys.settings.all).toEqual(['settings'])
      expect(queryKeys.settings.detail('rootPath')).toEqual(['settings', 'detail', 'rootPath'])
    })
  })

  describe('auditLog', () => {
    it('byEntity uses both entityType and entityId', () => {
      expect(queryKeys.auditLog.byEntity('video', 'v-1')).toEqual([
        'auditLog',
        'byEntity',
        'video',
        'v-1'
      ])
    })

    it('recent includes the limit', () => {
      expect(queryKeys.auditLog.recent(100)).toEqual(['auditLog', 'recent', 100])
    })
  })

  describe('operations', () => {
    it('byStatus segregates per status', () => {
      const pending = queryKeys.operations.byStatus('pending')
      const completed = queryKeys.operations.byStatus('completed')
      expect(pending).toEqual(['operations', 'byStatus', 'pending'])
      expect(completed).toEqual(['operations', 'byStatus', 'completed'])
    })
  })

  describe('search', () => {
    it('query key separates by both query string and limit', () => {
      expect(queryKeys.search.query('foo', 10)).toEqual(['search', 'all', 'foo', 10])
      expect(queryKeys.search.query('foo', 20)).not.toEqual(queryKeys.search.query('foo', 10))
      expect(queryKeys.search.query('bar', 10)).not.toEqual(queryKeys.search.query('foo', 10))
    })
  })

  describe('collections', () => {
    it('list, detail, items all branch off the same root namespace', () => {
      expect(queryKeys.collections.all[0]).toBe('collections')
      expect(queryKeys.collections.list({ page: 1, pageSize: 10 })[0]).toBe('collections')
      expect(queryKeys.collections.detail('col-1')[0]).toBe('collections')
      expect(queryKeys.collections.items('col-1')[0]).toBe('collections')
    })
  })

  describe('updater + tags namespaces', () => {
    it('exposes static keys without builders', () => {
      expect(queryKeys.updater.status).toEqual(['updater', 'status'])
      expect(queryKeys.tags.all).toEqual(['tags'])
      expect(queryKeys.tags.distinct).toEqual(['tags', 'distinct'])
    })
  })

  it('does not collide across top-level namespaces (each namespace owns its first segment)', () => {
    // Quick sanity that no two `.all` arrays land on the same prefix — a
    // regression that copy-pastes one namespace into another would cause
    // every invalidation in either to also wipe the other.
    const allKeys = [
      queryKeys.creators.all,
      queryKeys.videos.all,
      queryKeys.cuts.all,
      queryKeys.settings.all,
      queryKeys.auditLog.all,
      queryKeys.operations.all,
      queryKeys.tags.all,
      queryKeys.search.all,
      queryKeys.collections.all
    ].map((k) => k[0])
    expect(new Set(allKeys).size).toBe(allKeys.length)
  })
})
