import { describe, it, expect } from 'vitest'
import { slugify } from '@domain/types'

describe('slugify', () => {
  it('lowercases the input', () => {
    expect(slugify('HelloWorld')).toBe('helloworld')
  })

  it('replaces spaces with hyphens', () => {
    expect(slugify('hello world')).toBe('hello-world')
  })

  it('replaces underscores with hyphens', () => {
    expect(slugify('hello_world')).toBe('hello-world')
  })

  it('strips diacritical marks', () => {
    expect(slugify('café résumé')).toBe('cafe-resume')
  })

  it('strips non-alphanumeric characters', () => {
    expect(slugify('Mr.Beast! @gaming')).toBe('mrbeast-gaming')
  })

  it('collapses consecutive hyphens', () => {
    expect(slugify('hello---world')).toBe('hello-world')
  })

  it('trims leading and trailing hyphens', () => {
    expect(slugify('--hello--')).toBe('hello')
  })

  it('handles emoji by stripping them', () => {
    expect(slugify('MrBeast 🎮')).toBe('mrbeast')
  })

  it('handles mixed unicode and ASCII', () => {
    expect(slugify('Ñoño García')).toBe('nono-garcia')
  })

  it('returns empty string for all-special-character input', () => {
    expect(slugify('🎮🎵🎤')).toBe('')
  })

  it('handles multiple spaces and special chars', () => {
    expect(slugify('  Hello   World!!  ')).toBe('hello-world')
  })

  it('handles already-slugified input', () => {
    expect(slugify('already-slugified')).toBe('already-slugified')
  })

  it('preserves numbers', () => {
    expect(slugify('Channel 123')).toBe('channel-123')
  })
})
