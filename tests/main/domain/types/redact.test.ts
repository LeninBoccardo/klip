import { describe, it, expect } from 'vitest'
import { redactPath, redactError } from '@domain/types/redact'

describe('redactPath', () => {
  it('replaces a known root prefix with `<root>`', () => {
    expect(
      redactPath('/Users/lenin/Documents/klip/creator-a/video.mp4', '/Users/lenin/Documents/klip')
    ).toBe('<root>/creator-a/video.mp4')
  })

  it('replaces every occurrence of the root inside the value', () => {
    const root = '/Users/lenin/klip'
    expect(redactPath(`Failed to move ${root}/creator-a to ${root}/creator-b`, root)).toBe(
      'Failed to move <root>/creator-a to <root>/creator-b'
    )
  })

  it('falls back to last-two-segments when no root is provided', () => {
    expect(redactPath('/Users/lenin/Documents/klip/creator-a/video.mp4')).toBe(
      '<…>/creator-a/video.mp4'
    )
  })

  it('falls back to last-two-segments when value lies outside the root', () => {
    expect(redactPath('/etc/passwd', '/Users/lenin/klip')).toBe('/etc/passwd')
  })

  it('keeps short paths verbatim', () => {
    expect(redactPath('/etc')).toBe('/etc')
    expect(redactPath('a/b')).toBe('a/b')
  })

  it('handles Windows-style separators', () => {
    expect(redactPath('C:\\Users\\lenin\\klip\\creator\\file.mp4')).toBe('<…>/creator/file.mp4')
  })

  it('returns the literal string for null/undefined inputs', () => {
    expect(redactPath(null)).toBe('null')
    expect(redactPath(undefined)).toBe('undefined')
  })
})

describe('redactError', () => {
  it('redacts the root inside an Error stack', () => {
    const err = new Error('bad thing')
    err.stack = 'Error: bad thing\n  at fn (/Users/lenin/klip/src/main/x.ts:10:1)'
    expect(redactError(err, '/Users/lenin/klip')).toBe(
      'Error: bad thing\n  at fn (<root>/src/main/x.ts:10:1)'
    )
  })

  it('returns the message when there is no stack', () => {
    const err = new Error('bad thing')
    delete err.stack
    expect(redactError(err)).toBe('bad thing')
  })

  it('coerces non-Error values to string', () => {
    expect(redactError('plain string')).toBe('plain string')
    expect(redactError(42)).toBe('42')
    expect(redactError({ message: 'shape' })).toBe('[object Object]')
  })

  it('redacts a known root inside a stringified non-Error', () => {
    expect(redactError('cd /Users/lenin/klip failed', '/Users/lenin/klip')).toBe('cd <root> failed')
  })
})
