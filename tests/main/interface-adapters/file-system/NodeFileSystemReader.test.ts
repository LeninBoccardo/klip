import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { NodeFileSystemReader } from '@main/interface-adapters/file-system/NodeFileSystemReader'

let dir: string
const reader = new NodeFileSystemReader()

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'klip-fsreader-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('NodeFileSystemReader.directoryExists', () => {
  it('returns true for an existing directory', () => {
    expect(reader.directoryExists(dir)).toBe(true)
  })

  it('returns false for a missing path', () => {
    expect(reader.directoryExists(join(dir, 'nope'))).toBe(false)
  })

  it('returns false when the path is a file (not a directory)', () => {
    const filePath = join(dir, 'a.txt')
    writeFileSync(filePath, 'x')
    expect(reader.directoryExists(filePath)).toBe(false)
  })
})

describe('NodeFileSystemReader.fileExists', () => {
  it('returns true for an existing file', () => {
    const filePath = join(dir, 'a.txt')
    writeFileSync(filePath, 'x')
    expect(reader.fileExists(filePath)).toBe(true)
  })

  it('returns false for a missing path', () => {
    expect(reader.fileExists(join(dir, 'nope.txt'))).toBe(false)
  })

  it('returns false when the path is a directory (not a file)', () => {
    expect(reader.fileExists(dir)).toBe(false)
  })
})

describe('NodeFileSystemReader.listDirectories', () => {
  it('returns an array of subdirectory names', () => {
    mkdirSync(join(dir, 'a'))
    mkdirSync(join(dir, 'b'))
    writeFileSync(join(dir, 'c.txt'), 'x')
    expect(reader.listDirectories(dir).sort()).toEqual(['a', 'b'])
  })

  it('returns an empty array when the path does not exist (swallowed error)', () => {
    expect(reader.listDirectories(join(dir, 'nope'))).toEqual([])
  })

  it('returns an empty array when the path is a file (not a directory)', () => {
    const filePath = join(dir, 'a.txt')
    writeFileSync(filePath, 'x')
    expect(reader.listDirectories(filePath)).toEqual([])
  })
})

describe('NodeFileSystemReader.listFiles', () => {
  it('returns an array of file names (not subdirectories)', () => {
    mkdirSync(join(dir, 'sub'))
    writeFileSync(join(dir, 'a.txt'), 'x')
    writeFileSync(join(dir, 'b.json'), '{}')
    expect(reader.listFiles(dir).sort()).toEqual(['a.txt', 'b.json'])
  })

  it('returns an empty array when the path does not exist', () => {
    expect(reader.listFiles(join(dir, 'nope'))).toEqual([])
  })
})

describe('NodeFileSystemReader.readJsonFile', () => {
  it('parses a valid JSON file and returns the typed result', () => {
    const filePath = join(dir, 'data.json')
    writeFileSync(filePath, JSON.stringify({ x: 1, y: 'two' }))
    expect(reader.readJsonFile<{ x: number; y: string }>(filePath)).toEqual({ x: 1, y: 'two' })
  })

  it('returns null when the file does not exist', () => {
    expect(reader.readJsonFile(join(dir, 'nope.json'))).toBeNull()
  })

  it('returns null when the file is malformed JSON', () => {
    const filePath = join(dir, 'bad.json')
    writeFileSync(filePath, '{ "open: true ')
    expect(reader.readJsonFile(filePath)).toBeNull()
  })
})

describe('NodeFileSystemReader.readTextFile', () => {
  it('returns the file contents as a string', () => {
    const filePath = join(dir, 'a.txt')
    writeFileSync(filePath, 'hello world')
    expect(reader.readTextFile(filePath)).toBe('hello world')
  })

  it('returns null when the file does not exist', () => {
    expect(reader.readTextFile(join(dir, 'nope.txt'))).toBeNull()
  })
})
