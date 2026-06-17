import type { EntityStatus, ProbeStatus } from '@domain/types'

export interface Video {
  id: string
  creatorId: string
  title: string
  url: string | null
  duration: number | null
  resolution: string | null
  fileSize: number | null
  /** Frames per second from ffprobe (e.g. 29.97); null until probed. */
  frameRate: number | null
  filePath: string
  thumbnailPath: string | null
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
  transcriptPath: string | null
  /** Plain text extracted from the VTT, populated by FetchVideoDetail and indexed by videos_fts. */
  transcriptText: string | null
  detailFetchedAt: string | null
  status: EntityStatus
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}
