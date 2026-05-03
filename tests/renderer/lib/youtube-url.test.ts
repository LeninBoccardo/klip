import { describe, it, expect } from 'vitest'
import { isYouTubeUrl, isHttpUrl, extractFirstUrl } from '@/lib/youtube-url'

describe('isYouTubeUrl', () => {
  it('accepts canonical youtube.com URLs', () => {
    expect(isYouTubeUrl('https://www.youtube.com/watch?v=abc')).toBe(true)
    expect(isYouTubeUrl('https://youtube.com/watch?v=abc')).toBe(true)
  })

  it('accepts short youtu.be links', () => {
    expect(isYouTubeUrl('https://youtu.be/abc')).toBe(true)
  })

  it('accepts mobile and music subdomains', () => {
    expect(isYouTubeUrl('https://m.youtube.com/watch?v=abc')).toBe(true)
    expect(isYouTubeUrl('https://music.youtube.com/watch?v=abc')).toBe(true)
  })

  it('rejects non-YouTube hosts', () => {
    expect(isYouTubeUrl('https://vimeo.com/123')).toBe(false)
    expect(isYouTubeUrl('https://example.com/youtube.com')).toBe(false)
  })

  it('rejects non-HTTP schemes', () => {
    expect(isYouTubeUrl('javascript:alert(1)')).toBe(false)
    expect(isYouTubeUrl('file:///tmp/youtube.com')).toBe(false)
  })

  it('rejects malformed input', () => {
    expect(isYouTubeUrl('not-a-url')).toBe(false)
    expect(isYouTubeUrl('')).toBe(false)
  })

  it('trims whitespace before validating', () => {
    expect(isYouTubeUrl('  https://youtu.be/abc  ')).toBe(true)
  })
})

describe('isHttpUrl', () => {
  it('accepts http and https', () => {
    expect(isHttpUrl('http://example.com')).toBe(true)
    expect(isHttpUrl('https://example.com')).toBe(true)
  })

  it('rejects other schemes', () => {
    expect(isHttpUrl('ftp://example.com')).toBe(false)
    expect(isHttpUrl('javascript:void(0)')).toBe(false)
  })
})

describe('extractFirstUrl', () => {
  it('returns null for empty input', () => {
    expect(extractFirstUrl('')).toBeNull()
  })

  it('returns the URL when input is a single line', () => {
    expect(extractFirstUrl('https://youtube.com/watch?v=abc')).toBe(
      'https://youtube.com/watch?v=abc'
    )
  })

  it('skips RFC 2483 comment lines (starting with #)', () => {
    const text = '# comment\nhttps://youtu.be/abc'
    expect(extractFirstUrl(text)).toBe('https://youtu.be/abc')
  })

  it('returns the first valid URL when multiple lines are present', () => {
    const text = 'https://first.example.com/video\nhttps://second.example.com/video'
    expect(extractFirstUrl(text)).toBe('https://first.example.com/video')
  })

  it('returns null when no valid HTTP URL is present', () => {
    expect(extractFirstUrl('not a url\nalso not a url')).toBeNull()
    expect(extractFirstUrl('javascript:alert(1)')).toBeNull()
  })

  it('handles CRLF line separators', () => {
    expect(extractFirstUrl('# comment\r\nhttps://youtu.be/abc')).toBe('https://youtu.be/abc')
  })
})
