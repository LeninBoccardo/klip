import type { EntityStatus } from '../types/entity-status'
import type { ProbeStatus } from '../types/probe-status'

/**
 * Renderer-facing representation of a video.
 *
 * Does **not** expose `filePath`, `thumbnailPath`, or `transcriptPath` — the
 * renderer references media via the entity-keyed `klip-media://video/<id>/file`
 * scheme and never holds raw filesystem paths. Boolean `hasThumbnail` /
 * `hasTranscript` flags let the UI short-circuit broken-image cases without
 * leaking the underlying path.
 */
export interface VideoDto {
  id: string
  creatorId: string
  title: string
  url: string | null
  duration: number | null
  resolution: string | null
  fileSize: number | null
  /** Frames per second from ffprobe (e.g. 29.97); null until probed. */
  frameRate: number | null
  hasThumbnail: boolean
  hasTranscript: boolean
  downloadDate: string | null
  probeStatus: ProbeStatus
  viewCount: number | null
  likeCount: number | null
  dislikeCount: number | null
  commentCount: number | null
  category: string | null
  tags: string[]
  uploadDate: string | null
  description: string | null
  isShort: boolean
  detailFetchedAt: string | null
  status: EntityStatus
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}
