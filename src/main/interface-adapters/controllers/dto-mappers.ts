import type { Creator, Video, Cut, Operation } from '@domain/entities'
import type { CreatorDto, VideoDto, CutDto, OperationDto } from '@shared/dtos'
import type { EditRecipe, PaginatedResult } from '@shared/types'
import { editRecipeSchema } from '@shared/types'

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
    frameRate: video.frameRate,
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
    editRecipe: parseEditRecipeJson(cut.editRecipeJson),
    probeStatus: cut.probeStatus,
    status: cut.status,
    deletedAt: cut.deletedAt,
    createdAt: cut.createdAt,
    updatedAt: cut.updatedAt
  }
}

/**
 * Map an Operation entity to its DTO, dropping `payload` — it embeds serialized
 * absolute filesystem paths (migrate_root old/new roots) that must not cross
 * the IPC boundary. (F63)
 */
export function toOperationDto(op: Operation): OperationDto {
  return {
    id: op.id,
    type: op.type,
    status: op.status,
    error: op.error,
    startedAt: op.startedAt,
    completedAt: op.completedAt,
    createdAt: op.createdAt
  }
}

/**
 * Parse the entity's persisted JSON column through the canonical Zod
 * schema. Returns null for missing or malformed payloads so a corrupted
 * row never crashes the renderer; the v2 "re-edit this cut" path simply
 * won't offer rehydration for that cut, which is the right fallback.
 */
function parseEditRecipeJson(raw: string | null): EditRecipe | null {
  if (raw === null) return null
  try {
    const parsed = editRecipeSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
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
