import { describe, it, expect } from 'vitest'
import { formatDuration, formatFileSize, mediaUrl } from '@/lib/format'

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

describe('mediaUrl', () => {
  it('builds an entity-keyed video file URL', () => {
    expect(mediaUrl('video', 'abc123', 'file')).toBe('klip-media://video/abc123/file')
  })

  it('builds an entity-keyed video thumbnail URL', () => {
    expect(mediaUrl('video', 'abc123', 'thumbnail')).toBe('klip-media://video/abc123/thumbnail')
  })

  it('builds an entity-keyed cut file URL', () => {
    expect(mediaUrl('cut', 'cut-id-1', 'file')).toBe('klip-media://cut/cut-id-1/file')
  })

  it('builds a creator avatar URL', () => {
    expect(mediaUrl('creator', 'jane-doe', 'avatar')).toBe('klip-media://creator/jane-doe/avatar')
  })

  it('encodes ids that contain reserved URL characters', () => {
    // IDs are slugified or UUIDs by construction, but defensively encode.
    const url = mediaUrl('video', 'id with space', 'file')
    expect(url).toBe('klip-media://video/id%20with%20space/file')
  })
})
