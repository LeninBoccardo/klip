import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isMac, modifierLabel, tokenizeShortcut } from '@/lib/platform-key'

const originalUserAgent = navigator.userAgent

function setUserAgent(ua: string): void {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
}

afterEach(() => {
  setUserAgent(originalUserAgent)
})

describe('isMac', () => {
  it('returns true for macOS user-agent strings', () => {
    setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)'
    )
    expect(isMac()).toBe(true)
  })

  it.each(['iPhone', 'iPad', 'iPod'])('returns true for %s user-agents', (token) => {
    setUserAgent(`Mozilla/5.0 (${token}; CPU OS like Mac OS X)`)
    expect(isMac()).toBe(true)
  })

  it('returns false for Windows user-agents', () => {
    setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
    expect(isMac()).toBe(false)
  })

  it('returns false for Linux user-agents', () => {
    setUserAgent('Mozilla/5.0 (X11; Linux x86_64)')
    expect(isMac()).toBe(false)
  })
})

describe('modifierLabel', () => {
  it('returns ⌘ on mac', () => {
    setUserAgent('Macintosh; Intel Mac OS X 10_15_7')
    expect(modifierLabel()).toBe('⌘')
  })

  it('returns Ctrl on non-mac', () => {
    setUserAgent('Windows NT 10.0')
    expect(modifierLabel()).toBe('Ctrl')
  })
})

describe('tokenizeShortcut — modifier combos', () => {
  beforeEach(() => setUserAgent('Windows NT 10.0'))

  it('expands "mod+k" to ["Ctrl", "K"] on non-mac', () => {
    expect(tokenizeShortcut('mod+k')).toEqual(['Ctrl', 'K'])
  })

  it('expands "mod+enter" to ["Ctrl", "enter"]', () => {
    // Multi-char tokens are passed through unchanged (only 1-char tokens are uppercased).
    expect(tokenizeShortcut('mod+enter')).toEqual(['Ctrl', 'enter'])
  })

  it('expands "shift+a" to ["Shift", "A"]', () => {
    expect(tokenizeShortcut('shift+a')).toEqual(['Shift', 'A'])
  })

  it('expands "alt+x" to ["Alt", "X"] on non-mac', () => {
    expect(tokenizeShortcut('alt+x')).toEqual(['Alt', 'X'])
  })

  it('expands "alt+x" to ["⌥", "X"] on mac', () => {
    setUserAgent('Macintosh; Mac OS X')
    expect(tokenizeShortcut('alt+x')).toEqual(['⌥', 'X'])
  })

  it('expands "mod+k" to ["⌘", "K"] on mac', () => {
    setUserAgent('Macintosh; Mac OS X')
    expect(tokenizeShortcut('mod+k')).toEqual(['⌘', 'K'])
  })
})

describe('tokenizeShortcut — chord sequences', () => {
  it('splits a "g h" chord into ["G", "H"]', () => {
    expect(tokenizeShortcut('g h')).toEqual(['G', 'H'])
  })

  it('splits a chord with multi-char names without uppercasing them', () => {
    expect(tokenizeShortcut('g escape')).toEqual(['G', 'escape'])
  })
})

describe('tokenizeShortcut — single-key shortcuts', () => {
  it('uppercases a single character', () => {
    expect(tokenizeShortcut('?')).toEqual(['?'])
    expect(tokenizeShortcut('/')).toEqual(['/'])
    expect(tokenizeShortcut('a')).toEqual(['A'])
  })

  it('passes a multi-char single token through unchanged', () => {
    expect(tokenizeShortcut('escape')).toEqual(['escape'])
    expect(tokenizeShortcut('arrowleft')).toEqual(['arrowleft'])
  })
})
