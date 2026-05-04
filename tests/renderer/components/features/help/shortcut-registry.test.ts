import { describe, it, expect } from 'vitest'
import { SHORTCUTS, GROUPS, shortcutsByGroup } from '@/components/features/help/shortcut-registry'
import enShortcuts from '@renderer/i18n/locales/en/shortcuts.json'

describe('SHORTCUTS — integrity', () => {
  it('has unique ids across every entry', () => {
    const ids = SHORTCUTS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('does not duplicate `keys` within a non-player group (player FSM allows reuse with k/j/arrows)', () => {
    for (const group of GROUPS) {
      if (group === 'player') continue
      const entries = SHORTCUTS.filter((s) => s.group === group)
      const keys = entries.map((e) => e.keys)
      expect(new Set(keys).size, `group "${group}" has duplicate keys: ${keys.join(', ')}`).toBe(
        keys.length
      )
    }
  })

  it('every descriptionKey resolves against the EN shortcuts bundle', () => {
    type LocaleBundle = { entries: Record<string, string> }
    const entries = (enShortcuts as LocaleBundle).entries
    for (const entry of SHORTCUTS) {
      const key = entry.descriptionKey.replace(/^entries\./, '')
      expect(
        entries[key],
        `Missing translation for shortcut id="${entry.id}" key="${entry.descriptionKey}"`
      ).toBeDefined()
    }
  })

  it('every entry belongs to a known group', () => {
    const allowed = new Set(GROUPS)
    for (const entry of SHORTCUTS) {
      expect(allowed.has(entry.group)).toBe(true)
    }
  })
})

describe('shortcutsByGroup', () => {
  it('partitions SHORTCUTS by the requested group', () => {
    for (const group of GROUPS) {
      const expected = SHORTCUTS.filter((s) => s.group === group)
      const got = shortcutsByGroup(group)
      expect(got).toEqual(expected)
    }
  })

  it('returns the same entries the GROUPS reduction would (totals match)', () => {
    const total = GROUPS.reduce((sum, group) => sum + shortcutsByGroup(group).length, 0)
    expect(total).toBe(SHORTCUTS.length)
  })
})
