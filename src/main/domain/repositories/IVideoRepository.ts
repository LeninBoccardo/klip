import type { Video } from '@domain/entities'
import type { PaginatedResult, EntityStatus, ProbeStatus } from '@domain/types'
import type { VideoQueryParams } from '@shared/types'

export type { VideoQueryParams } from '@shared/types'

export interface IVideoRepository {
  findAll(): Video[]
  findAllActive(): Video[]
  findById(id: string): Video | null
  findByCreatorId(creatorId: string): Video[]
  findByProbeStatus(status: ProbeStatus): Video[]
  /** Active videos with a URL but detail metadata never fetched (detailFetchedAt IS NULL) */
  findNeedingDetail(): Video[]
  upsert(video: Video): void
  updateStatus(id: string, status: EntityStatus, deletedAt: string | null): void
  updateProbeStatus(id: string, probeStatus: ProbeStatus): void
  delete(id: string): void
  findPaginated(params: VideoQueryParams): PaginatedResult<Video>
  /** Bulk-replace a path prefix in filePath and thumbnailPath columns */
  updateFilePathPrefix(oldPrefix: string, newPrefix: string): void
}
