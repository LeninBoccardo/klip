import type { Creator, Video, Cut } from '@domain/entities'
import type { CreatorDto, VideoDto, CutDto } from '@shared/dtos'
import type { PaginatedResult } from '@shared/types'

/**
 * Boundary-layer mappers from domain entities to renderer-facing DTOs.
 *
 * The mappers strip filesystem paths (`filePath`, `thumbnailPath`,
 * `transcriptPath`, `profileImagePath`) and replace them with boolean
 * presence flags. The renderer references media via the entity-keyed
 * `klip-media://<kind>/<id>/<asset>` protocol scheme — it never holds a
 * raw filesystem path, which closes the path-traversal threat surface
 * for any field that originates from attacker-controlled metadata.
 */

export function toCreatorDto(creator: Creator): CreatorDto {
  return {
    id: creator.id,
    folderName: creator.folderName,
    name: creator.name,
    hasLocalAvatar: creator.profileImagePath !== null,
    youtubeChannelId: creator.youtubeChannelId,
    youtubeChannelUrl: creator.youtubeChannelUrl,
    subscriberCount: creator.subscriberCount,
    avatarUrl: creator.avatarUrl,
    notes: creator.notes,
    tags: creator.tags,
    status: creator.status,
    deletedAt: creator.deletedAt,
    createdAt: creator.createdAt,
    updatedAt: creator.updatedAt
  }
}

export function toVideoDto(video: Video): VideoDto {
  return {
    id: video.id,
    creatorId: video.creatorId,
    title: video.title,
    url: video.url,
    duration: video.duration,
    resolution: video.resolution,
    fileSize: video.fileSize,
    hasThumbnail: video.thumbnailPath !== null,
    hasTranscript: video.transcriptPath !== null,
    downloadDate: video.downloadDate,
    probeStatus: video.probeStatus,
    viewCount: video.viewCount,
    likeCount: video.likeCount,
    dislikeCount: video.dislikeCount,
    commentCount: video.commentCount,
    category: video.category,
    tags: video.tags,
    uploadDate: video.uploadDate,
    description: video.description,
    isShort: video.isShort,
    detailFetchedAt: video.detailFetchedAt,
    status: video.status,
    deletedAt: video.deletedAt,
    createdAt: video.createdAt,
    updatedAt: video.updatedAt
  }
}

export function toCutDto(cut: Cut): CutDto {
  return {
    id: cut.id,
    creatorId: cut.creatorId,
    videoId: cut.videoId,
    title: cut.title,
    tags: cut.tags,
    startTimestamp: cut.startTimestamp,
    endTimestamp: cut.endTimestamp,
    duration: cut.duration,
    resolution: cut.resolution,
    fileSize: cut.fileSize,
    hasThumbnail: cut.thumbnailPath !== null,
    probeStatus: cut.probeStatus,
    status: cut.status,
    deletedAt: cut.deletedAt,
    createdAt: cut.createdAt,
    updatedAt: cut.updatedAt
  }
}

/** Map a paginated entity result through a single-entity mapper. */
export function mapPaginated<E, D>(
  page: PaginatedResult<E>,
  mapper: (entity: E) => D
): PaginatedResult<D> {
  return {
    data: page.data.map(mapper),
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    totalPages: page.totalPages
  }
}
