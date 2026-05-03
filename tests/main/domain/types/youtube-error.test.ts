import { describe, it, expect } from 'vitest'
import {
  classifyYoutubeError,
  shouldMarkMissing
} from '@main/domain/types/youtube-error'

describe('classifyYoutubeError', () => {
  it('classifies HTTP 404 as unavailable', () => {
    expect(classifyYoutubeError(new Error('HTTP Error 404: Not Found'))).toBe('unavailable')
  })

  it('classifies "Video unavailable" as unavailable', () => {
    expect(classifyYoutubeError(new Error('ERROR: [youtube] xyz: Video unavailable'))).toBe(
      'unavailable'
    )
  })

  it('classifies "removed by the uploader" as unavailable', () => {
    expect(classifyYoutubeError(new Error('This video has been removed by the uploader'))).toBe(
      'unavailable'
    )
  })

  it('classifies HTTP 403 as unauthorized', () => {
    expect(classifyYoutubeError(new Error('HTTP Error 403: Forbidden'))).toBe('unauthorized')
  })

  it('classifies "Private video" as unauthorized', () => {
    expect(classifyYoutubeError(new Error('Private video. Sign in if you have access.'))).toBe(
      'unauthorized'
    )
  })

  it('classifies age-gated as unauthorized', () => {
    expect(classifyYoutubeError(new Error('Sign in to confirm your age'))).toBe('unauthorized')
  })

  it('classifies region-locked as unauthorized', () => {
    expect(classifyYoutubeError(new Error('not available in your country'))).toBe('unauthorized')
  })

  it('classifies HTTP 5xx as transient', () => {
    expect(classifyYoutubeError(new Error('HTTP Error 502: Bad Gateway'))).toBe('transient')
    expect(classifyYoutubeError(new Error('HTTP Error 503: Service Unavailable'))).toBe(
      'transient'
    )
  })

  it('classifies HTTP 429 (rate limit) as transient', () => {
    expect(classifyYoutubeError(new Error('HTTP Error 429: Too Many Requests'))).toBe('transient')
  })

  it('classifies network timeouts as transient', () => {
    expect(classifyYoutubeError(new Error('connect ETIMEDOUT 1.2.3.4:443'))).toBe('transient')
    expect(classifyYoutubeError(new Error('socket hang up: ECONNRESET'))).toBe('transient')
  })

  it('classifies a generic error as unknown', () => {
    expect(classifyYoutubeError(new Error('something weird happened'))).toBe('unknown')
  })

  it('handles non-Error values gracefully', () => {
    expect(classifyYoutubeError(undefined)).toBe('unknown')
    expect(classifyYoutubeError(null)).toBe('unknown')
    expect(classifyYoutubeError('a plain string')).toBe('unknown')
  })
})

describe('shouldMarkMissing', () => {
  it('flags unavailable + unauthorized as missing-worthy', () => {
    expect(shouldMarkMissing('unavailable')).toBe(true)
    expect(shouldMarkMissing('unauthorized')).toBe(true)
  })

  it('does not flag transient or unknown', () => {
    expect(shouldMarkMissing('transient')).toBe(false)
    expect(shouldMarkMissing('unknown')).toBe(false)
  })
})
