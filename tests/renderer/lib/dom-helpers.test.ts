import { describe, it, expect, afterEach } from 'vitest'
import { isTextInputActive } from '@/lib/dom-helpers'

afterEach(() => {
  document.body.innerHTML = ''
  ;(document.activeElement as HTMLElement | null)?.blur?.()
})

describe('isTextInputActive', () => {
  it('returns false when nothing is focused', () => {
    expect(isTextInputActive()).toBe(false)
  })

  it('returns true when an INPUT is focused', () => {
    const el = document.createElement('input')
    document.body.appendChild(el)
    el.focus()
    expect(isTextInputActive()).toBe(true)
  })

  it('returns true when a TEXTAREA is focused', () => {
    const el = document.createElement('textarea')
    document.body.appendChild(el)
    el.focus()
    expect(isTextInputActive()).toBe(true)
  })

  it('returns true when a SELECT is focused', () => {
    const el = document.createElement('select')
    document.body.appendChild(el)
    el.focus()
    expect(isTextInputActive()).toBe(true)
  })

  it('returns true when a contentEditable element is focused', () => {
    const el = document.createElement('div')
    // jsdom doesn't fully implement the live `isContentEditable` getter, but
    // it does honour an explicit setter. Override it on the instance so the
    // helper's lookup matches what a real browser would report.
    Object.defineProperty(el, 'isContentEditable', { value: true, configurable: true })
    el.contentEditable = 'true'
    el.tabIndex = 0
    document.body.appendChild(el)
    el.focus()
    expect(isTextInputActive()).toBe(true)
  })

  it('returns false when a non-input element is focused (e.g. a button)', () => {
    const btn = document.createElement('button')
    btn.tabIndex = 0
    document.body.appendChild(btn)
    btn.focus()
    expect(isTextInputActive()).toBe(false)
  })

  it('returns false when an anchor is focused', () => {
    const a = document.createElement('a')
    a.href = '#'
    a.tabIndex = 0
    document.body.appendChild(a)
    a.focus()
    expect(isTextInputActive()).toBe(false)
  })
})
