import { describe, it, expect } from 'vitest'
import { parseVtt, parseVttSegments, VttTooLargeError } from '@main/domain/types/parse-vtt'

describe('parseVtt', () => {
  it('returns plain text from a minimal VTT', () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:02.500
Hello world

00:00:02.500 --> 00:00:05.000
This is a transcript`

    expect(parseVtt(vtt)).toBe('Hello world\nThis is a transcript')
  })

  it('strips inline tags like <c> and <00:00:01.000>', () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:02.000
<00:00:00.500><c>Hello</c> <c>world</c>`

    expect(parseVtt(vtt)).toBe('Hello world')
  })

  it('drops NOTE / STYLE / Kind: / Language: metadata blocks', () => {
    const vtt = `WEBVTT
Kind: captions
Language: en

NOTE
This is a note that should be ignored

00:00:00.000 --> 00:00:02.000
Spoken line`

    expect(parseVtt(vtt)).toBe('Spoken line')
  })

  it('de-duplicates consecutive identical cues (yt-dlp rolling captions)', () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:01.000
Hello

00:00:01.000 --> 00:00:02.000
Hello

00:00:02.000 --> 00:00:03.000
World`

    expect(parseVtt(vtt)).toBe('Hello\nWorld')
  })

  it('returns an empty string when the file has no spoken cues', () => {
    expect(parseVtt('WEBVTT\n\n')).toBe('')
  })

  it('throws VttTooLargeError on input above the size cap (defends the inline-tag stripper)', () => {
    // 11 MB of literal "<" — over the 10 MB cap. The unbalanced angle-bracket
    // input would feed the /<[^>]+>/g stripper a pathological string.
    const oversized = '<'.repeat(11 * 1024 * 1024)
    expect(() => parseVtt(oversized)).toThrow(VttTooLargeError)
  })
})

describe('parseVttSegments', () => {
  it('emits one segment per cue with start/end in ms', () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:02.500
Hello world

00:00:02.500 --> 00:00:05.000
This is a transcript`

    expect(parseVttSegments(vtt)).toEqual([
      { startMs: 0, endMs: 2500, text: 'Hello world' },
      { startMs: 2500, endMs: 5000, text: 'This is a transcript' }
    ])
  })

  it('parses hours, minutes, and fractional seconds correctly', () => {
    const vtt = `WEBVTT

01:23:45.678 --> 01:23:50.000
Late in the show`

    expect(parseVttSegments(vtt)).toEqual([
      { startMs: 5025678, endMs: 5030000, text: 'Late in the show' }
    ])
  })

  it('strips inline tags inside cue text', () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:02.000
<00:00:00.500><c>Hello</c> <c>world</c>`

    expect(parseVttSegments(vtt)).toEqual([
      { startMs: 0, endMs: 2000, text: 'Hello world' }
    ])
  })

  it('merges rolling-caption duplicates by extending endMs of the first segment', () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:01.000
Hello

00:00:01.000 --> 00:00:02.000
Hello

00:00:02.000 --> 00:00:03.000
World`

    expect(parseVttSegments(vtt)).toEqual([
      { startMs: 0, endMs: 2000, text: 'Hello' },
      { startMs: 2000, endMs: 3000, text: 'World' }
    ])
  })

  it('ignores cue settings on the timing line', () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:02.000 align:start position:0% line:80%
Spoken`

    expect(parseVttSegments(vtt)).toEqual([
      { startMs: 0, endMs: 2000, text: 'Spoken' }
    ])
  })

  it('joins multi-line cue text with single spaces', () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:02.000
Line one
Line two`

    expect(parseVttSegments(vtt)).toEqual([
      { startMs: 0, endMs: 2000, text: 'Line one Line two' }
    ])
  })

  it('skips NOTE / STYLE / metadata blocks', () => {
    const vtt = `WEBVTT
Kind: captions
Language: en

NOTE
ignore me

00:00:00.000 --> 00:00:01.000
ok`

    expect(parseVttSegments(vtt)).toEqual([
      { startMs: 0, endMs: 1000, text: 'ok' }
    ])
  })

  it('returns an empty array for an empty VTT', () => {
    expect(parseVttSegments('WEBVTT\n\n')).toEqual([])
  })

  it('throws VttTooLargeError on oversized input', () => {
    const oversized = '<'.repeat(11 * 1024 * 1024)
    expect(() => parseVttSegments(oversized)).toThrow(VttTooLargeError)
  })
})
