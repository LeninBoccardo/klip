import { describe, it, expect } from 'vitest'
import { formatDuration, formatFileSize, toMediaSrc } from '@/lib/format'

describe('formatDuration', () => {
  it('returns dash for null', () => {
    expect(formatDuration(null)).toBe('—')
  })

  it('formats seconds only', () => {
    expect(formatDuration(45)).toBe('0:45')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(125)).toBe('2:05')
  })

  it('formats hours, minutes, and seconds', () => {
    expect(formatDuration(3661)).toBe('1:01:01')
  })

  it('formats zero', () => {
    expect(formatDuration(0)).toBe('0:00')
  })

  it('formats exactly one hour', () => {
    expect(formatDuration(3600)).toBe('1:00:00')
  })
})

describe('formatFileSize', () => {
  it('returns dash for null', () => {
    expect(formatFileSize(null)).toBe('—')
  })

  it('formats bytes', () => {
    expect(formatFileSize(512)).toBe('512 B')
  })

  it('formats kilobytes', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB')
  })

  it('formats megabytes', () => {
    expect(formatFileSize(10 * 1024 * 1024)).toBe('10.0 MB')
  })

  it('formats gigabytes', () => {
    expect(formatFileSize(2.5 * 1024 * 1024 * 1024)).toBe('2.50 GB')
  })

  it('formats zero bytes', () => {
    expect(formatFileSize(0)).toBe('0 B')
  })
})

describe('toMediaSrc', () => {
  it('returns undefined for null', () => {
    expect(toMediaSrc(null)).toBeUndefined()
  })

  it('returns undefined for empty string', () => {
    expect(toMediaSrc('')).toBeUndefined()
  })

  it('converts a file path to klip-media:// URL', () => {
    const result = toMediaSrc('C:\\Users\\test\\thumb.jpg')
    expect(result).toBe(`klip-media://${encodeURIComponent('C:\\Users\\test\\thumb.jpg')}`)
  })

  it('encodes special characters', () => {
    const result = toMediaSrc('/path/with spaces/file.jpg')
    expect(result).toContain('klip-media://')
    expect(result).toContain(encodeURIComponent('/path/with spaces/file.jpg'))
  })
})
