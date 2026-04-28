import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return { ...actual, realpathSync: vi.fn() }
})

import { realpathSync } from 'fs'
import { sep } from 'path'
import {
  parseKlipMediaUrl,
  checkPathInsideRoot
} from '@main/framework-drivers/electron/klip-media-protocol'

describe('parseKlipMediaUrl', () => {
  it('parses a valid video/file URL', () => {
    const result = parseKlipMediaUrl('klip-media://video/abc123/file')
    expect(result).toEqual({ ok: true, kind: 'video', id: 'abc123', asset: 'file' })
  })

  it('parses a valid video/thumbnail URL', () => {
    const result = parseKlipMediaUrl('klip-media://video/abc123/thumbnail')
    expect(result).toEqual({ ok: true, kind: 'video', id: 'abc123', asset: 'thumbnail' })
  })

  it('parses a valid cut/file URL', () => {
    const result = parseKlipMediaUrl('klip-media://cut/2f9a-uuid/file')
    expect(result).toEqual({ ok: true, kind: 'cut', id: '2f9a-uuid', asset: 'file' })
  })

  it('parses a valid creator/avatar URL', () => {
    const result = parseKlipMediaUrl('klip-media://creator/jane-doe/avatar')
    expect(result).toEqual({ ok: true, kind: 'creator', id: 'jane-doe', asset: 'avatar' })
  })

  it('decodes URL-encoded ids', () => {
    const result = parseKlipMediaUrl('klip-media://video/id%20with%20space/file')
    expect(result).toEqual({ ok: true, kind: 'video', id: 'id with space', asset: 'file' })
  })

  it('rejects an empty URL with 400', () => {
    expect(parseKlipMediaUrl('klip-media://')).toEqual({ ok: false, status: 400 })
  })

  it('rejects a URL with too few segments', () => {
    expect(parseKlipMediaUrl('klip-media://video/abc')).toEqual({ ok: false, status: 400 })
  })

  it('rejects a URL with too many segments', () => {
    expect(parseKlipMediaUrl('klip-media://video/abc/file/extra')).toEqual({
      ok: false,
      status: 400
    })
  })

  it('rejects an unknown kind with 400', () => {
    expect(parseKlipMediaUrl('klip-media://settings/abc/file')).toEqual({
      ok: false,
      status: 400
    })
  })

  it('rejects an unknown asset with 400', () => {
    expect(parseKlipMediaUrl('klip-media://video/abc/raw')).toEqual({ ok: false, status: 400 })
  })

  it('rejects an empty id with 400', () => {
    expect(parseKlipMediaUrl('klip-media://video//file')).toEqual({ ok: false, status: 400 })
  })

  it('rejects legacy path-based URLs that look like absolute paths', () => {
    // The renderer must never construct path-based URLs; they parse to too many
    // segments (because Windows paths have C:/Users/... split on '/'), or
    // unknown kind.
    expect(parseKlipMediaUrl('klip-media:///etc/passwd')).toEqual({ ok: false, status: 400 })
    expect(parseKlipMediaUrl('klip-media://C:/Users/me/file.mp4')).toEqual({
      ok: false,
      status: 400
    })
  })
})

describe('checkPathInsideRoot', () => {
  beforeEach(() => {
    vi.mocked(realpathSync).mockReset()
  })

  it('accepts a path strictly inside the root', () => {
    const root = `${sep}root`
    const file = `${sep}root${sep}creator-a${sep}video.mp4`
    vi.mocked(realpathSync).mockImplementation((p) => p as string)

    const result = checkPathInsideRoot(file, root)

    expect(result).toEqual({ ok: true, absolutePath: file })
  })

  it('accepts the root path itself', () => {
    const root = `${sep}root`
    vi.mocked(realpathSync).mockImplementation((p) => p as string)

    expect(checkPathInsideRoot(root, root)).toEqual({ ok: true, absolutePath: root })
  })

  it('rejects a path outside the root with 403', () => {
    const root = `${sep}root`
    const outside = `${sep}etc${sep}passwd`
    vi.mocked(realpathSync).mockImplementation((p) => p as string)

    expect(checkPathInsideRoot(outside, root)).toEqual({ ok: false, status: 403 })
  })

  it('rejects a sibling path that shares a prefix with the root', () => {
    const root = `${sep}root`
    const sibling = `${sep}root-evil${sep}file.mp4`
    vi.mocked(realpathSync).mockImplementation((p) => p as string)

    expect(checkPathInsideRoot(sibling, root)).toEqual({ ok: false, status: 403 })
  })

  it('rejects a symlink that escapes the root', () => {
    const root = `${sep}root`
    const symlinkPath = `${sep}root${sep}symlink`
    vi.mocked(realpathSync).mockImplementation((p) => {
      if (p === symlinkPath) return `${sep}etc${sep}passwd`
      return p as string
    })

    expect(checkPathInsideRoot(symlinkPath, root)).toEqual({ ok: false, status: 403 })
  })

  it('returns 404 when the requested path does not exist', () => {
    const root = `${sep}root`
    vi.mocked(realpathSync).mockImplementation((p) => {
      if (p === root) return root
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    })

    expect(checkPathInsideRoot(`${sep}root${sep}missing.mp4`, root)).toEqual({
      ok: false,
      status: 404
    })
  })

  it('returns 500 when the configured root cannot be resolved', () => {
    const root = `${sep}root`
    vi.mocked(realpathSync).mockImplementation((p) => {
      if (p === root) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      return p as string
    })

    expect(checkPathInsideRoot(`${sep}root${sep}file.mp4`, root)).toEqual({
      ok: false,
      status: 500
    })
  })
})
