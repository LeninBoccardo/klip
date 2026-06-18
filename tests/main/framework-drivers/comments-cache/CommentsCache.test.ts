import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { VideoCommentsResult } from '@shared/types'

// `node:fs` namespace exports are non-configurable under ESM, so `vi.spyOn`
// can't wrap them in place (same constraint FfprobeMediaProbe.test.ts hits with
// `fs`). Instead we mock `node:fs` *before* importing the SUT: every function
// delegates to the real implementation by default, but is a `vi.fn` so any test
// can override a single call to force an error branch. Real FS round-trips
// still happen against an isolated temp dir.
const real = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('node:fs') as typeof import('node:fs')
})

const fsMock = vi.hoisted(() => ({
  existsSync: vi.fn(real.existsSync),
  mkdirSync: vi.fn(real.mkdirSync),
  readFileSync: vi.fn(real.readFileSync),
  rmSync: vi.fn(real.rmSync),
  writeFileSync: vi.fn(real.writeFileSync)
}))

vi.mock('node:fs', () => fsMock)

import { CommentsCache } from '@main/framework-drivers/comments-cache/CommentsCache'

const TTL_MS = 7 * 24 * 60 * 60 * 1000

function makeResult(overrides: Partial<VideoCommentsResult> = {}): VideoCommentsResult {
  return {
    videoId: 'abc123_XYZ',
    comments: [
      {
        id: 'c1',
        text: 'hello',
        author: 'someone',
        authorId: 'uc1',
        likeCount: 3,
        isPinned: false,
        parentId: null,
        timestamp: 1700000000
      }
    ],
    totalFetched: 1,
    wasTruncated: false,
    fetchedAt: new Date().toISOString(),
    fromCache: false,
    ...overrides
  }
}

describe('CommentsCache', () => {
  let dir: string
  let cache: CommentsCache

  beforeEach(() => {
    // mkdtempSync stays real (it's not on the mock surface we override).
    dir = real.mkdtempSync(join(tmpdir(), 'klip-comments-test-'))
    // Restore the default (real) implementation on every mocked fn.
    fsMock.existsSync.mockReset().mockImplementation(real.existsSync)
    fsMock.mkdirSync.mockReset().mockImplementation(real.mkdirSync)
    fsMock.readFileSync.mockReset().mockImplementation(real.readFileSync)
    fsMock.rmSync.mockReset().mockImplementation(real.rmSync)
    fsMock.writeFileSync.mockReset().mockImplementation(real.writeFileSync)
    cache = new CommentsCache(dir)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    real.rmSync(dir, { recursive: true, force: true })
  })

  describe('constructor', () => {
    it('defaults to <tmpdir>/klip-comments when no dir is provided', () => {
      const defaultCache = new CommentsCache()
      // No file exists yet, so a read is a clean miss but must not throw —
      // proving the default dir was wired without touching a custom path.
      expect(defaultCache.read('whatever')).toBeNull()
    })
  })

  describe('write', () => {
    it('persists a result and stores fromCache: false regardless of the input flag', () => {
      // Pass fromCache: true to prove the field is overwritten on disk.
      cache.write(makeResult({ videoId: 'vid_write_1', fromCache: true }))

      const file = join(dir, 'vid_write_1.json')
      const onDisk = JSON.parse(real.readFileSync(file, 'utf-8'))
      expect(onDisk.fromCache).toBe(false)
      expect(onDisk.videoId).toBe('vid_write_1')
      expect(onDisk.totalFetched).toBe(1)
    })

    it('creates the cache directory recursively if it does not exist', () => {
      const nestedDir = join(dir, 'deeply', 'nested', 'cache')
      const nestedCache = new CommentsCache(nestedDir)

      nestedCache.write(makeResult({ videoId: 'nested_id' }))

      expect(real.existsSync(join(nestedDir, 'nested_id.json'))).toBe(true)
      expect(fsMock.mkdirSync).toHaveBeenCalledWith(nestedDir, { recursive: true })
    })

    it('rejects an invalid videoId without writing anything', () => {
      cache.write(makeResult({ videoId: 'has/slash' }))
      expect(fsMock.writeFileSync).not.toHaveBeenCalled()
      expect(fsMock.mkdirSync).not.toHaveBeenCalled()
    })

    it('rejects a videoId longer than 64 chars', () => {
      const tooLong = 'a'.repeat(65)
      cache.write(makeResult({ videoId: tooLong }))
      expect(fsMock.writeFileSync).not.toHaveBeenCalled()
    })

    it('rejects an empty videoId', () => {
      cache.write(makeResult({ videoId: '' }))
      expect(fsMock.writeFileSync).not.toHaveBeenCalled()
    })

    it('accepts the full set of legal videoId characters', () => {
      cache.write(makeResult({ videoId: 'AZaz09_-' }))
      expect(real.existsSync(join(dir, 'AZaz09_-.json'))).toBe(true)
    })

    it('swallows and logs a write failure (writeFileSync throws)', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      fsMock.writeFileSync.mockImplementationOnce(() => {
        throw new Error('disk full')
      })

      expect(() => cache.write(makeResult({ videoId: 'write_fail' }))).not.toThrow()
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('[CommentsCache] write failed for write_fail'),
        'disk full'
      )
    })

    it('logs a non-Error thrown value as-is on write failure (mkdir throws a string)', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      fsMock.mkdirSync.mockImplementationOnce(() => {
        throw 'string failure'
      })

      cache.write(makeResult({ videoId: 'write_fail2' }))
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('[CommentsCache] write failed for write_fail2'),
        'string failure'
      )
    })
  })

  describe('read', () => {
    it('returns the cached result with fromCache: true on a fresh, valid hit', () => {
      const original = makeResult({ videoId: 'round_trip', totalFetched: 5, wasTruncated: true })
      cache.write(original)

      const result = cache.read('round_trip')
      expect(result).toEqual({
        videoId: 'round_trip',
        comments: original.comments,
        totalFetched: 5,
        wasTruncated: true,
        fetchedAt: original.fetchedAt,
        fromCache: true
      })
    })

    it('returns null for an invalid videoId without touching the FS', () => {
      expect(cache.read('../escape')).toBeNull()
      expect(fsMock.existsSync).not.toHaveBeenCalled()
    })

    it('returns null on a miss (file does not exist)', () => {
      expect(cache.read('never_written')).toBeNull()
    })

    it('returns null and deletes the file on a JSON parse error, logging a warning', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const file = join(dir, 'corrupt.json')
      real.writeFileSync(file, '{ not valid json', 'utf-8')

      expect(cache.read('corrupt')).toBeNull()
      expect(real.existsSync(file)).toBe(false)
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('[CommentsCache] read failed for corrupt'),
        expect.any(String)
      )
    })

    it('returns null and deletes the file when the payload shape is invalid', () => {
      const file = join(dir, 'badshape.json')
      // comments is not an array.
      real.writeFileSync(
        file,
        JSON.stringify({
          videoId: 'badshape',
          comments: 'nope',
          totalFetched: 0,
          wasTruncated: false,
          fetchedAt: new Date().toISOString()
        }),
        'utf-8'
      )

      expect(cache.read('badshape')).toBeNull()
      expect(real.existsSync(file)).toBe(false)
    })

    it.each([
      ['videoId not a string', { videoId: 123 }],
      ['comments not an array', { comments: {} }],
      ['totalFetched not a number', { totalFetched: '1' }],
      ['wasTruncated not a boolean', { wasTruncated: 'true' }],
      ['fetchedAt not a string', { fetchedAt: 12345 }]
    ])('rejects payloads where %s', (_label, override) => {
      const file = join(dir, 'shape_branch.json')
      const base = {
        videoId: 'shape_branch',
        comments: [],
        totalFetched: 0,
        wasTruncated: false,
        fetchedAt: new Date().toISOString()
      }
      real.writeFileSync(file, JSON.stringify({ ...base, ...override }), 'utf-8')

      expect(cache.read('shape_branch')).toBeNull()
      expect(real.existsSync(file)).toBe(false)
    })

    it('returns null and deletes the file when the entry is expired (older than TTL)', () => {
      const stale = makeResult({
        videoId: 'stale',
        fetchedAt: new Date(Date.now() - TTL_MS - 1000).toISOString()
      })
      cache.write(stale)
      const file = join(dir, 'stale.json')
      expect(real.existsSync(file)).toBe(true)

      expect(cache.read('stale')).toBeNull()
      expect(real.existsSync(file)).toBe(false)
    })

    it('returns the entry when it is comfortably within the TTL', () => {
      const fresh = makeResult({
        videoId: 'edge',
        fetchedAt: new Date(Date.now() - (TTL_MS - 60_000)).toISOString()
      })
      cache.write(fresh)

      const result = cache.read('edge')
      expect(result).not.toBeNull()
      expect(result?.fromCache).toBe(true)
    })

    it('returns null and deletes the file when fetchedAt is an unparseable date', () => {
      const file = join(dir, 'baddate.json')
      real.writeFileSync(
        file,
        JSON.stringify({
          videoId: 'baddate',
          comments: [],
          totalFetched: 0,
          wasTruncated: false,
          fetchedAt: 'not-a-real-date'
        }),
        'utf-8'
      )

      expect(cache.read('baddate')).toBeNull()
      expect(real.existsSync(file)).toBe(false)
    })

    it('returns null, logs, and attempts cleanup when readFileSync throws on an existing file', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      // File must exist so we pass the existsSync gate and reach the try block.
      cache.write(makeResult({ videoId: 'read_throw' }))
      fsMock.readFileSync.mockImplementationOnce(() => {
        throw new Error('EACCES')
      })

      expect(cache.read('read_throw')).toBeNull()
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('[CommentsCache] read failed for read_throw'),
        'EACCES'
      )
    })

    it('logs a non-Error thrown value as-is on read failure', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      cache.write(makeResult({ videoId: 'read_throw2' }))
      fsMock.readFileSync.mockImplementationOnce(() => {
        throw 'raw string error'
      })

      expect(cache.read('read_throw2')).toBeNull()
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('[CommentsCache] read failed for read_throw2'),
        'raw string error'
      )
    })

    it('swallows a cleanup failure when the post-error delete itself throws (safeDelete catch)', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      cache.write(makeResult({ videoId: 'read_then_rm_fail' }))
      fsMock.readFileSync.mockImplementationOnce(() => {
        throw new Error('EACCES')
      })
      fsMock.rmSync.mockImplementationOnce(() => {
        throw new Error('rm denied')
      })

      expect(() => cache.read('read_then_rm_fail')).not.toThrow()
    })
  })

  describe('invalidate', () => {
    it('deletes an existing entry', () => {
      cache.write(makeResult({ videoId: 'to_invalidate' }))
      const file = join(dir, 'to_invalidate.json')
      expect(real.existsSync(file)).toBe(true)

      cache.invalidate('to_invalidate')
      expect(real.existsSync(file)).toBe(false)
    })

    it('is a no-op on a miss (no file present)', () => {
      expect(() => cache.invalidate('does_not_exist')).not.toThrow()
    })

    it('ignores an invalid videoId', () => {
      cache.invalidate('bad/id')
      expect(fsMock.rmSync).not.toHaveBeenCalled()
    })

    it('swallows errors from the underlying delete (safeDelete catch)', () => {
      fsMock.rmSync.mockImplementationOnce(() => {
        throw new Error('rm failed')
      })
      expect(() => cache.invalidate('valid_id')).not.toThrow()
    })
  })
})
