import { describe, it, expect } from 'vitest'
import { parseSnippet } from '@/lib/highlight-snippet'

describe('parseSnippet', () => {
  it('returns a single plain segment when there are no markers', () => {
    expect(parseSnippet('plain text')).toEqual([{ highlighted: false, text: 'plain text' }])
  })

  it('emits alternating plain and highlighted segments', () => {
    expect(parseSnippet('foo <<<bar>>> baz')).toEqual([
      { highlighted: false, text: 'foo ' },
      { highlighted: true, text: 'bar' },
      { highlighted: false, text: ' baz' }
    ])
  })

  it('handles multiple matches', () => {
    expect(parseSnippet('a <<<b>>> c <<<d>>> e')).toEqual([
      { highlighted: false, text: 'a ' },
      { highlighted: true, text: 'b' },
      { highlighted: false, text: ' c ' },
      { highlighted: true, text: 'd' },
      { highlighted: false, text: ' e' }
    ])
  })

  it('handles a leading match (no preceding plain segment)', () => {
    expect(parseSnippet('<<<hi>>> there')).toEqual([
      { highlighted: true, text: 'hi' },
      { highlighted: false, text: ' there' }
    ])
  })

  it('tolerates an unbalanced opener at the end', () => {
    expect(parseSnippet('foo <<<bar')).toEqual([
      { highlighted: false, text: 'foo ' },
      { highlighted: false, text: 'bar' }
    ])
  })

  it('returns empty array for empty input', () => {
    expect(parseSnippet('')).toEqual([])
  })
})
