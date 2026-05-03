import { describe, it, expect } from 'vitest'
import { escapeLike } from '@main/interface-adapters/repositories/escape-like'

// Pairs `escapeLike` with the `ESCAPE '\'` clause used by repositories.
// The H4 fix relies on this output being stable; the integration is
// exercised in the repo tests, but the escape rules themselves are
// pinned here so a regression surfaces in isolation.
describe('escapeLike', () => {
  it('escapes the % wildcard', () => {
    expect(escapeLike('50%')).toBe('50\\%')
  })

  it('escapes the _ wildcard', () => {
    expect(escapeLike('foo_bar')).toBe('foo\\_bar')
  })

  it('escapes the backslash itself', () => {
    expect(escapeLike('a\\b')).toBe('a\\\\b')
  })

  it('escapes all three at once in a mixed string', () => {
    expect(escapeLike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d')
  })

  it('passes plain strings through unchanged', () => {
    expect(escapeLike('hello world')).toBe('hello world')
  })

  it('handles the empty string', () => {
    expect(escapeLike('')).toBe('')
  })

  it('escapes repeated wildcards independently', () => {
    expect(escapeLike('%%__')).toBe('\\%\\%\\_\\_')
  })

  it('preserves a windows-style path prefix used by updateFilePathPrefix', () => {
    // The H4 caller pattern: escapeLike(oldPrefix) + '%'. Backslashes in
    // C:\Users\... must be escaped so the LIKE doesn't treat them as the
    // ESCAPE-clause escape itself, otherwise `_` in usernames gets matched
    // as a wildcard.
    expect(escapeLike('C:\\Users\\jane_doe\\klip')).toBe('C:\\\\Users\\\\jane\\_doe\\\\klip')
  })
})
