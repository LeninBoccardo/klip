import { describe, it, expect } from 'vitest'
import {
  parseProgressLine,
  pickChannelAvatar,
  largestByArea
} from '@main/framework-drivers/yt-dlp/yt-dlp-helpers'

// Pure helpers extracted from YtDlpDownloader so the parsing/selection
// logic can be tested without spawning yt-dlp. Spawn integration is covered
// by `npm run smoke` plus manual download QA.

describe('parseProgressLine', () => {
  const downloadId = 'dl-1'
  const url = 'https://yt/x'

  it('parses a well-formed line', () => {
    const out = parseProgressLine('  42.5%|  2.50MiB/s|00:15', downloadId, url)
    expect(out).toEqual({
      downloadId,
      url,
      percent: 42.5,
      speed: '2.50MiB/s',
      eta: '00:15',
      status: 'downloading'
    })
  })

  it('returns null for a line with too few pipe segments', () => {
    expect(parseProgressLine('not a progress line', downloadId, url)).toBeNull()
    expect(parseProgressLine('40%|10KB/s', downloadId, url)).toBeNull()
  })

  it('returns null when the percent is not a number', () => {
    expect(parseProgressLine('NaN%|10KB/s|00:01', downloadId, url)).toBeNull()
    expect(parseProgressLine('%|10KB/s|00:01', downloadId, url)).toBeNull()
  })

  it("converts 'N/A' speed and eta to null (yt-dlp emits these on stalls)", () => {
    const out = parseProgressLine('  10.0%|N/A|N/A', downloadId, url)
    expect(out?.speed).toBeNull()
    expect(out?.eta).toBeNull()
    expect(out?.percent).toBe(10)
  })

  it('keeps 0% as a valid line (initial progress)', () => {
    const out = parseProgressLine('   0.0%|  0.00B/s|--:--', downloadId, url)
    expect(out?.percent).toBe(0)
    expect(out?.status).toBe('downloading')
  })

  it('threads downloadId and url through unchanged', () => {
    const out = parseProgressLine('50.0%|1KiB/s|00:02', 'dl-99', 'https://yt/y')
    expect(out?.downloadId).toBe('dl-99')
    expect(out?.url).toBe('https://yt/y')
  })

  it('handles trailing whitespace / surrounding spaces', () => {
    const out = parseProgressLine('  100.0% |  5.00MiB/s |00:00 ', downloadId, url)
    expect(out?.percent).toBe(100)
    expect(out?.speed).toBe('5.00MiB/s')
    expect(out?.eta).toBe('00:00')
  })
})

describe('pickChannelAvatar', () => {
  it('returns null for a non-array', () => {
    expect(pickChannelAvatar(null)).toBeNull()
    expect(pickChannelAvatar(undefined)).toBeNull()
    expect(pickChannelAvatar('not-array')).toBeNull()
  })

  it('returns null for an empty array', () => {
    expect(pickChannelAvatar([])).toBeNull()
  })

  it('returns null when no entry has a string url', () => {
    expect(pickChannelAvatar([{ width: 100, height: 100 }, { url: 42 }])).toBeNull()
  })

  it("prefers entries tagged 'avatar' even when a banner is larger", () => {
    const out = pickChannelAvatar([
      { url: 'banner.jpg', id: 'banner', width: 2560, height: 1440 },
      { url: 'avatar.jpg', id: 'avatar_uncropped', width: 800, height: 800 }
    ])
    expect(out).toBe('avatar.jpg')
  })

  it("picks the largest avatar-tagged entry when multiple have 'avatar' in the id", () => {
    const out = pickChannelAvatar([
      { url: 'small.jpg', id: 'avatar', width: 100, height: 100 },
      { url: 'big.jpg', id: 'avatar_full', width: 800, height: 800 }
    ])
    expect(out).toBe('big.jpg')
  })

  it('falls back to the near-square thumbnail when no avatar tag is present', () => {
    const out = pickChannelAvatar([
      { url: 'banner.jpg', width: 2000, height: 500 }, // 4:1 ratio — banner
      { url: 'square.jpg', width: 500, height: 500 } // 1:1 — avatar
    ])
    expect(out).toBe('square.jpg')
  })

  it('treats ratios in the 0.8–1.25 window as square', () => {
    // 4:5 = 0.8 → square; 5:4 = 1.25 → square. Both pass the window.
    const out = pickChannelAvatar([
      { url: 'banner.jpg', width: 2000, height: 500 },
      { url: 'fourbyfive.jpg', width: 400, height: 500 }
    ])
    expect(out).toBe('fourbyfive.jpg')
  })

  it('falls back to largest-by-area when nothing is square or tagged', () => {
    const out = pickChannelAvatar([
      { url: 'small-banner.jpg', width: 800, height: 200 },
      { url: 'big-banner.jpg', width: 2000, height: 500 }
    ])
    expect(out).toBe('big-banner.jpg')
  })

  it('returns the only entry when there is exactly one candidate', () => {
    expect(pickChannelAvatar([{ url: 'only.jpg', width: 50, height: 50 }])).toBe('only.jpg')
  })
})

describe('largestByArea', () => {
  it('picks the entry with the greatest width*height', () => {
    expect(
      largestByArea([
        { width: 10, height: 10 },
        { width: 20, height: 20 }
      ])
    ).toEqual({
      width: 20,
      height: 20
    })
  })

  it('treats missing dimensions as zero (does not throw)', () => {
    const out = largestByArea([{ width: 10, height: 10 }, {}])
    expect(out).toEqual({ width: 10, height: 10 })
  })
})
