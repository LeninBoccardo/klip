import { describe, it, expect } from 'vitest'
import { classifyDownloadError } from '@main/domain/types/download-error'

describe('classifyDownloadError', () => {
  it('classifies network timeouts as retriable', () => {
    expect(classifyDownloadError(new Error('connect ETIMEDOUT 1.2.3.4:443'))).toBe('retriable')
  })

  it('classifies ECONNRESET as retriable', () => {
    expect(classifyDownloadError(new Error('socket hang up: ECONNRESET'))).toBe('retriable')
  })

  it('classifies HTTP 5xx as retriable', () => {
    expect(classifyDownloadError(new Error('HTTP Error 502: Bad Gateway'))).toBe('retriable')
  })

  it('classifies HTTP 429 (rate limit) as retriable', () => {
    expect(classifyDownloadError(new Error('HTTP Error 429: Too Many Requests'))).toBe('retriable')
  })

  it('classifies fragment errors as retriable (yt-dlp partial download)', () => {
    expect(classifyDownloadError(new Error('Unable to download fragment 4'))).toBe('retriable')
  })

  it('classifies generic "network" mentions as retriable', () => {
    expect(classifyDownloadError(new Error('a network error occurred'))).toBe('retriable')
  })

  it('classifies "Unable to download webpage" as retriable', () => {
    expect(classifyDownloadError(new Error('Unable to download webpage: HTTP 503'))).toBe(
      'retriable'
    )
  })

  it('classifies HTTP 404 as terminal', () => {
    expect(classifyDownloadError(new Error('HTTP Error 404: Not Found'))).toBe('terminal')
  })

  it('classifies a missing video as terminal', () => {
    expect(classifyDownloadError(new Error('Video unavailable'))).toBe('terminal')
  })

  it('classifies a generic error as terminal', () => {
    expect(classifyDownloadError(new Error('something went wrong'))).toBe('terminal')
  })

  it('handles non-Error values without throwing', () => {
    expect(classifyDownloadError('plain string error')).toBe('terminal')
    expect(classifyDownloadError(undefined)).toBe('terminal')
    expect(classifyDownloadError(null)).toBe('terminal')
  })

  it('matches "timed out" with optional d', () => {
    expect(classifyDownloadError(new Error('connection timed out'))).toBe('retriable')
    expect(classifyDownloadError(new Error('time out'))).toBe('retriable')
  })
})
