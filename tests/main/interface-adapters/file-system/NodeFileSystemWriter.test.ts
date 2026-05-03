import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// Real-tmpdir tests for the happy paths (precedent: MigrateRootFolder.integration.test.ts)
// + a partial mock for the cross-device EXDEV branch and the partial-rm-failure
// path, which is the highest-value coverage in this file because corrupting it
// can leave the user's library half-migrated.

// vi.hoisted spies that the module-level fs mock can swap in/out.
const fsSpies = vi.hoisted(() => ({
  renameSync: vi.fn(),
  cpSync: vi.fn(),
  rmSync: vi.fn(),
  // Pass-throughs (filled in by the test setup with the actual fs functions).
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn()
}))

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  // Default to the real impls; individual tests can override the writer-relevant
  // ones (renameSync / cpSync / rmSync) via fsSpies.*.mockImplementation(…).
  fsSpies.renameSync.mockImplementation(actual.renameSync)
  fsSpies.cpSync.mockImplementation(actual.cpSync)
  fsSpies.rmSync.mockImplementation(actual.rmSync)
  fsSpies.mkdirSync.mockImplementation(actual.mkdirSync)
  fsSpies.writeFileSync.mockImplementation(actual.writeFileSync)
  fsSpies.readdirSync.mockImplementation(actual.readdirSync)
  return {
    ...actual,
    renameSync: fsSpies.renameSync,
    cpSync: fsSpies.cpSync,
    rmSync: fsSpies.rmSync,
    mkdirSync: fsSpies.mkdirSync,
    writeFileSync: fsSpies.writeFileSync,
    readdirSync: fsSpies.readdirSync
  }
})

import { NodeFileSystemWriter } from '@main/interface-adapters/file-system/NodeFileSystemWriter'

describe('NodeFileSystemWriter', () => {
  let writer: NodeFileSystemWriter
  let root: string

  beforeEach(() => {
    writer = new NodeFileSystemWriter()
    root = mkdtempSync(join(tmpdir(), 'klip-fswriter-'))
    // Reset spies' call history but keep their default impls (real fs).
    for (const spy of Object.values(fsSpies)) spy.mockClear()
  })

  afterEach(() => {
    // Real cleanup — bypass the spy because tests may have replaced rmSync.
    try {
      rmSync(root, { recursive: true, force: true })
    } catch {
      // best-effort
    }
  })

  describe('ensureDirectory', () => {
    it('creates the directory', () => {
      const dir = join(root, 'a', 'b', 'c')
      writer.ensureDirectory(dir)
      expect(existsSync(dir)).toBe(true)
    })

    it('is idempotent — calling twice does not throw', () => {
      const dir = join(root, 'a')
      writer.ensureDirectory(dir)
      expect(() => writer.ensureDirectory(dir)).not.toThrow()
    })
  })

  describe('writeFile', () => {
    it('writes UTF-8 content', () => {
      const file = join(root, 'sub', 'note.txt')
      writer.writeFile(file, 'olá')
      expect(readFileSync(file, 'utf-8')).toBe('olá')
    })

    it('creates parent directories implicitly', () => {
      const file = join(root, 'deep', 'nested', 'file.txt')
      writer.writeFile(file, 'hi')
      expect(existsSync(file)).toBe(true)
    })

    it('overwrites an existing file', () => {
      const file = join(root, 'file.txt')
      writer.writeFile(file, 'first')
      writer.writeFile(file, 'second')
      expect(readFileSync(file, 'utf-8')).toBe('second')
    })
  })

  describe('renameDirectory', () => {
    it('renames a directory in place', () => {
      const src = join(root, 'old')
      const dest = join(root, 'new')
      mkdirSync(src)
      writeFileSync(join(src, 'a.txt'), 'x')
      writer.renameDirectory(src, dest)
      expect(existsSync(src)).toBe(false)
      expect(readFileSync(join(dest, 'a.txt'), 'utf-8')).toBe('x')
    })
  })

  describe('moveDirectory — same filesystem', () => {
    it('uses renameSync on the happy path (no cp fallback)', () => {
      const src = join(root, 'src')
      const dest = join(root, 'dest')
      mkdirSync(src)
      writeFileSync(join(src, 'file.txt'), 'data')

      writer.moveDirectory(src, dest)

      expect(existsSync(src)).toBe(false)
      expect(readFileSync(join(dest, 'file.txt'), 'utf-8')).toBe('data')
      expect(fsSpies.renameSync).toHaveBeenCalledTimes(1)
      expect(fsSpies.cpSync).not.toHaveBeenCalled()
      expect(fsSpies.rmSync).not.toHaveBeenCalled()
    })
  })

  describe('moveDirectory — cross-device fallback', () => {
    it('falls back to cpSync + rmSync when renameSync throws EXDEV', () => {
      const src = join(root, 'src')
      const dest = join(root, 'dest')
      mkdirSync(src)
      writeFileSync(join(src, 'file.txt'), 'data')

      // Simulate cross-device by forcing renameSync to throw EXDEV once.
      fsSpies.renameSync.mockImplementationOnce(() => {
        const err = new Error('cross-device link not permitted') as NodeJS.ErrnoException
        err.code = 'EXDEV'
        throw err
      })

      writer.moveDirectory(src, dest)

      expect(fsSpies.renameSync).toHaveBeenCalledTimes(1)
      expect(fsSpies.cpSync).toHaveBeenCalledTimes(1)
      expect(fsSpies.rmSync).toHaveBeenCalledTimes(1)
      // The real cp + rm impls run — verify the move actually completed.
      expect(existsSync(src)).toBe(false)
      expect(readFileSync(join(dest, 'file.txt'), 'utf-8')).toBe('data')
    })

    it('surfaces a partial-failure when rmSync throws after a successful cp', () => {
      // The corruption case: cp succeeded so the user has both copies, but rm
      // failed so the source isn't cleaned up. The use case (MigrateRootFolder)
      // relies on the error propagating so it can mark the operation partial.
      const src = join(root, 'src')
      const dest = join(root, 'dest')
      mkdirSync(src)
      writeFileSync(join(src, 'file.txt'), 'data')

      fsSpies.renameSync.mockImplementationOnce(() => {
        const err = new Error('EXDEV') as NodeJS.ErrnoException
        err.code = 'EXDEV'
        throw err
      })
      fsSpies.rmSync.mockImplementationOnce(() => {
        throw new Error('EBUSY: source still locked')
      })

      expect(() => writer.moveDirectory(src, dest)).toThrow(/EBUSY/)

      // cp ran, so the destination has the data — caller is responsible for
      // remembering that the source was not cleaned up.
      expect(existsSync(dest)).toBe(true)
      expect(readFileSync(join(dest, 'file.txt'), 'utf-8')).toBe('data')
      expect(existsSync(src)).toBe(true)
    })
  })

  describe('isDirectoryEmpty', () => {
    it('returns true for an empty directory', () => {
      const dir = join(root, 'empty')
      mkdirSync(dir)
      expect(writer.isDirectoryEmpty(dir)).toBe(true)
    })

    it('returns false when a file is present', () => {
      const dir = join(root, 'nonempty')
      mkdirSync(dir)
      writeFileSync(join(dir, 'a.txt'), 'x')
      expect(writer.isDirectoryEmpty(dir)).toBe(false)
    })

    it('returns false when only subdirectories are present', () => {
      const dir = join(root, 'parent')
      mkdirSync(join(dir, 'sub'), { recursive: true })
      expect(writer.isDirectoryEmpty(dir)).toBe(false)
    })
  })
})
