import { describe, it, expect, vi } from 'vitest'
import type { Creator, Video, Cut } from '@domain/entities'
import {
  toCreatorDto,
  toVideoDto,
  toCutDto,
  mapPaginated
} from '@main/interface-adapters/controllers/dto-mappers'

// The boundary mappers replace filesystem paths with `hasX` booleans so the
// renderer never holds a raw path (path-traversal threat closure). If a flag
// inverts, the UI shows phantom thumbnails or hides real ones — so each
// presence flag is pinned in both null and non-null directions.

const baseCreator: Creator = {
  id: 'creator-1',
  folderName: 'creator-one',
  name: 'Creator One',
  profileImagePath: null,
  youtubeChannelId: null,
  youtubeChannelUrl: null,
  subscriberCount: null,
  avatarUrl: null,
  notes: null,
  tags: [],
  status: 'active',
  deletedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z'
}

const baseVideo: Video = {
  id: 'video-1',
  creatorId: 'creator-1',
  title: 'Video 1',
  url: null,
  duration: null,
  resolution: null,
  fileSize: null,
  filePath: 'C:/library/creator-one/video-1.mp4',
  thumbnailPath: null,
  downloadDate: null,
  probeStatus: 'pending',
  viewCount: null,
  likeCount: null,
  dislikeCount: null,
  commentCount: null,
  category: null,
  tags: [],
  uploadDate: null,
  description: null,
  isShort: false,
  transcriptPath: null,
  detailFetchedAt: null,
  status: 'active',
  deletedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z'
}

const baseCut: Cut = {
  id: 'cut-1',
  creatorId: 'creator-1',
  videoId: 'video-1',
  title: 'Cut 1',
  tags: ['highlight'],
  startTimestamp: 0,
  endTimestamp: 30,
  duration: 30,
  resolution: '1080p',
  fileSize: 1024,
  filePath: 'C:/library/creator-one/cuts/cut-1.mp4',
  thumbnailPath: null,
  probeStatus: 'complete',
  status: 'active',
  deletedAt: null,
  editRecipeJson: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z'
}

describe('toCreatorDto', () => {
  it('strips profileImagePath and exposes hasLocalAvatar=false when null', () => {
    const dto = toCreatorDto(baseCreator)
    expect(dto.hasLocalAvatar).toBe(false)
    // The path itself must not leak into the DTO.
    expect(dto).not.toHaveProperty('profileImagePath')
  })

  it('exposes hasLocalAvatar=true when profileImagePath is populated', () => {
    const dto = toCreatorDto({ ...baseCreator, profileImagePath: 'C:/avatar.jpg' })
    expect(dto.hasLocalAvatar).toBe(true)
  })

  it('passes status, tags, and timestamps through unchanged', () => {
    const dto = toCreatorDto({
      ...baseCreator,
      status: 'deleted',
      tags: ['a', 'b'],
      deletedAt: '2026-05-01T00:00:00Z'
    })
    expect(dto.status).toBe('deleted')
    expect(dto.tags).toEqual(['a', 'b'])
    expect(dto.deletedAt).toBe('2026-05-01T00:00:00Z')
    expect(dto.createdAt).toBe(baseCreator.createdAt)
    expect(dto.updatedAt).toBe(baseCreator.updatedAt)
  })
})

describe('toVideoDto', () => {
  it('strips filePath and exposes hasThumbnail=false / hasTranscript=false when null', () => {
    const dto = toVideoDto(baseVideo)
    expect(dto.hasThumbnail).toBe(false)
    expect(dto.hasTranscript).toBe(false)
    expect(dto).not.toHaveProperty('filePath')
    expect(dto).not.toHaveProperty('thumbnailPath')
    expect(dto).not.toHaveProperty('transcriptPath')
  })

  it('exposes hasThumbnail=true when thumbnailPath is populated', () => {
    const dto = toVideoDto({ ...baseVideo, thumbnailPath: 'C:/thumb.webp' })
    expect(dto.hasThumbnail).toBe(true)
  })

  it('exposes hasTranscript=true when transcriptPath is populated', () => {
    const dto = toVideoDto({ ...baseVideo, transcriptPath: 'C:/sub.vtt' })
    expect(dto.hasTranscript).toBe(true)
  })

  it('keeps the two flags independent (one populated, one null)', () => {
    const dto = toVideoDto({
      ...baseVideo,
      thumbnailPath: 'C:/thumb.webp',
      transcriptPath: null
    })
    expect(dto.hasThumbnail).toBe(true)
    expect(dto.hasTranscript).toBe(false)
  })

  it('passes probeStatus and isShort through unchanged', () => {
    const dto = toVideoDto({ ...baseVideo, probeStatus: 'failed', isShort: true })
    expect(dto.probeStatus).toBe('failed')
    expect(dto.isShort).toBe(true)
  })
})

describe('toCutDto', () => {
  it('strips filePath and exposes hasThumbnail=false when null', () => {
    const dto = toCutDto(baseCut)
    expect(dto.hasThumbnail).toBe(false)
    expect(dto).not.toHaveProperty('filePath')
    expect(dto).not.toHaveProperty('thumbnailPath')
  })

  it('exposes hasThumbnail=true when thumbnailPath is populated', () => {
    const dto = toCutDto({ ...baseCut, thumbnailPath: 'C:/cut-thumb.webp' })
    expect(dto.hasThumbnail).toBe(true)
  })

  it('keeps the videoId association', () => {
    expect(toCutDto({ ...baseCut, videoId: 'video-42' }).videoId).toBe('video-42')
    expect(toCutDto({ ...baseCut, videoId: null }).videoId).toBeNull()
  })

  it('passes timestamps and probeStatus through', () => {
    const dto = toCutDto({ ...baseCut, startTimestamp: 12.5, endTimestamp: 47.5 })
    expect(dto.startTimestamp).toBe(12.5)
    expect(dto.endTimestamp).toBe(47.5)
    expect(dto.probeStatus).toBe('complete')
  })
})

describe('mapPaginated', () => {
  it('maps every entity through the supplied mapper', () => {
    const page = {
      data: [baseCreator, { ...baseCreator, id: 'creator-2', name: 'Creator Two' }],
      total: 2,
      page: 1,
      pageSize: 10,
      totalPages: 1
    }
    const out = mapPaginated(page, toCreatorDto)
    expect(out.data).toHaveLength(2)
    expect(out.data[0].id).toBe('creator-1')
    expect(out.data[1].name).toBe('Creator Two')
  })

  it('preserves total / page / pageSize / totalPages exactly', () => {
    const page = {
      data: [],
      total: 47,
      page: 3,
      pageSize: 20,
      totalPages: 3
    }
    const out = mapPaginated(page, (x: Creator) => x)
    expect(out.total).toBe(47)
    expect(out.page).toBe(3)
    expect(out.pageSize).toBe(20)
    expect(out.totalPages).toBe(3)
  })

  it('handles an empty data array without invoking the mapper', () => {
    const mapper = vi.fn((x: Creator) => x)
    mapPaginated({ data: [], total: 0, page: 1, pageSize: 10, totalPages: 0 }, mapper)
    expect(mapper).not.toHaveBeenCalled()
  })
})
