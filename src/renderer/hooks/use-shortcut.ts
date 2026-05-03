import { useEffect, useRef } from 'react'
import { isTextInputActive } from '@/lib/dom-helpers'

/**
 * Spec accepts three shapes:
 *   - single key: `'?'`, `'/'`, `'Escape'`
 *   - modifier+key: `'mod+k'` (mod = ⌘ on mac, Ctrl elsewhere), `'shift+?'`
 *   - chord: `'g h'` (press g then h within `chordTimeoutMs`)
 *
 * Single-key and chord shortcuts are suppressed when focus is in a text input
 * (see `isTextInputActive`). Modifier shortcuts intentionally fire everywhere
 * since they're the escape hatch from typing surfaces.
 */
export type ShortcutSpec = string

export interface UseShortcutOptions {
  /** Disable the shortcut without unmounting the caller. Default: true. */
  enabled?: boolean
  /**
   * Set true to also fire when focus is inside a text input. Required for
   * shortcuts that explicitly affect the focused input (e.g. Esc to clear).
   * Default: false.
   */
  allowInInputs?: boolean
  /**
   * Chord buffer expiry in milliseconds. Pressing the prefix key resets the
   * timer; pressing the suffix within the window fires the shortcut. Default
   * 1500 — slow enough for two-handed users, fast enough not to feel sticky.
   */
  chordTimeoutMs?: number
}

const DEFAULT_CHORD_TIMEOUT = 1500

interface ParsedSpec {
  kind: 'single' | 'modifier' | 'chord'
  /** lowercased target key (the second key for chords, the only key for single/modifier) */
  key: string
  /** lowercased prefix key for chord */
  prefix?: string
  /** required modifier set for modifier specs */
  needsMod?: boolean
  needsShift?: boolean
  needsAlt?: boolean
}

function parseSpec(spec: string): ParsedSpec {
  if (spec.includes(' ')) {
    const [prefix, key] = spec.split(' ')
    return { kind: 'chord', prefix: prefix.toLowerCase(), key: key.toLowerCase() }
  }
  if (spec.includes('+')) {
    const parts = spec.split('+').map((p) => p.toLowerCase())
    const key = parts[parts.length - 1]
    return {
      kind: 'modifier',
      key,
      needsMod: parts.includes('mod'),
      needsShift: parts.includes('shift'),
      needsAlt: parts.includes('alt')
    }
  }
  return { kind: 'single', key: spec.toLowerCase() }
}

/**
 * Normalise an event's key for matching. We treat the printable key as the
 * source of truth — `event.key` already accounts for layout / shift, so `'?'`
 * fires for shift+/ on US layouts without the caller needing to know.
 */
function eventKey(event: KeyboardEvent): string {
  return event.key.toLowerCase()
}

function modifiersMatch(event: KeyboardEvent, parsed: ParsedSpec): boolean {
  if (parsed.kind === 'modifier') {
    const modPressed = event.metaKey || event.ctrlKey
    if (parsed.needsMod && !modPressed) return false
    if (!parsed.needsMod && modPressed) return false
    if ((parsed.needsShift ?? false) !== event.shiftKey) return false
    if ((parsed.needsAlt ?? false) !== event.altKey) return false
    return true
  }
  // Single & chord: no modifiers allowed (except shift, which is needed for
  // shifted printables like `?`). Disallow ctrl/meta/alt to avoid hijacking
  // browser shortcuts.
  return !event.metaKey && !event.ctrlKey && !event.altKey
}

export function useShortcut(
  spec: ShortcutSpec,
  handler: (event: KeyboardEvent) => void,
  options: UseShortcutOptions = {}
): void {
  const { enabled = true, allowInInputs = false, chordTimeoutMs = DEFAULT_CHORD_TIMEOUT } = options

  // Hold the latest handler in a ref so callers can pass an inline arrow
  // without re-binding the listener on every render.
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  })

  useEffect(() => {
    if (!enabled) return undefined
    const parsed = parseSpec(spec)

    let chordPrefixActive = false
    let chordTimer: ReturnType<typeof setTimeout> | null = null

    const clearChord = (): void => {
      chordPrefixActive = false
      if (chordTimer !== null) {
        clearTimeout(chordTimer)
        chordTimer = null
      }
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      // Suppress in inputs unless explicitly opted-in. Modifier shortcuts
      // (e.g. mod+k) always fire — they're the typing escape hatch.
      if (parsed.kind !== 'modifier' && !allowInInputs && isTextInputActive()) {
        return
      }

      if (parsed.kind === 'chord') {
        if (!modifiersMatch(event, parsed)) return
        const key = eventKey(event)
        if (!chordPrefixActive) {
          if (key === parsed.prefix) {
            chordPrefixActive = true
            chordTimer = setTimeout(clearChord, chordTimeoutMs)
          }
          return
        }
        // Buffer was active — check the suffix.
        if (key === parsed.key) {
          event.preventDefault()
          clearChord()
          handlerRef.current(event)
          return
        }
        // Any other key cancels the buffer (avoid a stale prefix lingering
        // after the user starts typing a different chord).
        clearChord()
        return
      }

      if (!modifiersMatch(event, parsed)) return
      if (eventKey(event) !== parsed.key) return
      event.preventDefault()
      handlerRef.current(event)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      clearChord()
    }
  }, [spec, enabled, allowInInputs, chordTimeoutMs])
}
