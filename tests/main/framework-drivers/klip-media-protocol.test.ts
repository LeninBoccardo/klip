import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return { ...actual, realpathSync: vi.fn() }
})

import { realpathSync } from 'fs'
import { sep } from 'path'
import { resolveKlipMediaRequest } from '@main/framework-drivers/electron/klip-media-protocol'

// All tests below use POSIX-style paths and rely on Node's real `path` module
// for `sep`. On a Windows runner `sep` resolves to '\\' — the realpath mock
// then has to mirror that platform's separator. We side-step the issue by
// always echoing the input through the mock so resolved paths stay 1:1 with
// what the test passed in, then sprinkling `sep` only where the production
// code uses it (the `root + sep` containment check).

describe('resolveKlipMediaRequest', () => {
  beforeEach(() => {
    vi.mocked(realpathSync).mockReset()
  })

  it('resolves files inside the root', () => {
    const root = `${sep}root`
    const file = `${sep}root${sep}creator-a${sep}video.mp4`
    vi.mocked(realpathSync).mockImplementation((p) => p as string)

    const result = resolveKlipMediaRequest(`klip-media://${file}`, root)

    expect(result).toEqual({ ok: true, absolutePath: file })
  })

  it('allows the root path itself', () => {
    const root = `${sep}root`
    vi.mocked(realpathSync).mockImplementation((p) => p as string)

    const result = resolveKlipMediaRequest(`klip-media://${root}`, root)

    expect(result).toEqual({ ok: true, absolutePath: root })
  })

  it('rejects paths outside the root with 403', () => {
    const root = `${sep}root`
    const outside = `${sep}etc${sep}passwd`
    vi.mocked(realpathSync).mockImplementation((p) => p as string)

    const result = resolveKlipMediaRequest(`klip-media://${outside}`, root)

    expect(result).toEqual({ ok: false, status: 403 })
  })

  it('rejects URL-encoded traversal even when realpath resolves it inside the root prefix string', () => {
    const root = `${sep}root`
    // Decoded request becomes "/root/../etc/passwd"; realpath collapses to "/etc/passwd".
    vi.mocked(realpathSync).mockImplementation((p) => {
      if (p === `${sep}root${sep}..${sep}etc${sep}passwd`) return `${sep}etc${sep}passwd`
      return p as string
    })

    const result = resolveKlipMediaRequest(
      `klip-media://${sep}root${sep}%2E%2E${sep}etc${sep}passwd`,
      root
    )

    expect(result).toEqual({ ok: false, status: 403 })
  })

  it('rejects sibling paths that share a prefix with the root', () => {
    const root = `${sep}root`
    const sibling = `${sep}root-evil${sep}file.mp4`
    vi.mocked(realpathSync).mockImplementation((p) => p as string)

    const result = resolveKlipMediaRequest(`klip-media://${sibling}`, root)

    expect(result).toEqual({ ok: false, status: 403 })
  })

  it('rejects symlinks that escape the root', () => {
    const root = `${sep}root`
    const symlinkPath = `${sep}root${sep}symlink`
    vi.mocked(realpathSync).mockImplementation((p) => {
      if (p === symlinkPath) return `${sep}etc${sep}passwd`
      return p as string
    })

    const result = resolveKlipMediaRequest(`klip-media://${symlinkPath}`, root)

    expect(result).toEqual({ ok: false, status: 403 })
  })

  it('returns 404 when the requested path does not exist', () => {
    const root = `${sep}root`
    vi.mocked(realpathSync).mockImplementation((p) => {
      if (p === root) return root
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    })

    const result = resolveKlipMediaRequest(`klip-media://${sep}root${sep}missing.mp4`, root)

    expect(result).toEqual({ ok: false, status: 404 })
  })

  it('returns 500 when the configured root cannot be resolved', () => {
    const root = `${sep}root`
    vi.mocked(realpathSync).mockImplementation((p) => {
      if (p === root) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      return p as string
    })

    const result = resolveKlipMediaRequest(`klip-media://${sep}root${sep}file.mp4`, root)

    expect(result).toEqual({ ok: false, status: 500 })
  })

  it('rejects relative paths with 400', () => {
    const result = resolveKlipMediaRequest('klip-media://creator-a/video.mp4', `${sep}root`)
    expect(result).toEqual({ ok: false, status: 400 })
  })

  it('rejects an empty path with 400', () => {
    const result = resolveKlipMediaRequest('klip-media://', `${sep}root`)
    expect(result).toEqual({ ok: false, status: 400 })
  })
})
