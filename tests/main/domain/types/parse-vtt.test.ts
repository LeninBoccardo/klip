import { describe, it, expect } from 'vitest'
import { parseVtt } from '@main/domain/types/parse-vtt'

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
})
