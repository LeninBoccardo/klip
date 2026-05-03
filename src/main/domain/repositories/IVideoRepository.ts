import type { Video } from '@domain/entities'
import type { PaginatedResult, EntityStatus, ProbeStatus } from '@domain/types'
import type { VideoQueryParams } from '@shared/types'

export type { VideoQueryParams } from '@shared/types'

export interface IVideoRepository {
  findAll(): Video[]
  findAllActive(): Video[]
  findById(id: string): Video | null
  findByCreatorId(creatorId: string): Video[]
  /**
   * Cheap id-only projection for audit-cascade enumeration: when a creator
   * is hard-deleted, FK CASCADE wipes its videos silently — we read this
   * list inside the same transaction so the audited decorator can append
   * one `cascade_deleted` entry per victim. Avoids materializing full Video
   * rows just to throw all but `id` away.
   */
  findIdsByCreator(creatorId: string): string[]
  findByProbeStatus(status: ProbeStatus): Video[]
  /** Active videos with a URL but detail metadata never fetched (detailFetchedAt IS NULL) */
  findNeedingDetail(): Video[]
  /** Active videos that have at least one of the given tags. */
  findByTags(tags: string[]): Video[]
  /**
   * Active videos whose `title` contains the (case-insensitive) query as a
   * substring. Caller bounds the result via `limit`. Used by the global
   * search palette.
   */
  searchByTitle(query: string, limit: number): Video[]
  /**
   * Returns every distinct tag used by an active video, with the number of
   * active videos that carry it. Tags are case-sensitive (the canonical form
   * is whatever was written to the JSON column).
   */
  getAllDistinctTags(): { tag: string; count: number }[]
  upsert(video: Video): void
  /** See {@link ICreatorRepository.upsertWithPrevious} — same semantics. */
  upsertWithPrevious(video: Video, previous: Video | null): void
  updateStatus(id: string, status: EntityStatus, deletedAt: string | null): void
  updateProbeStatus(id: string, probeStatus: ProbeStatus): void
  delete(id: string): void
  findPaginated(params: VideoQueryParams): PaginatedResult<Video>
  /** Bulk-replace a path prefix in filePath and thumbnailPath columns */
  updateFilePathPrefix(oldPrefix: string, newPrefix: string): void
  // ── Aggregates (used by dashboard + storage stats) ──
  /** Total count of active videos. */
  count(): number
  /** Count of active videos grouped by status. Includes only existing buckets. */
  countByStatus(): Partial<Record<EntityStatus, number>>
  /** Count of active videos that have a transcript indexed. */
  countTranscribed(): number
  /** Sum of `duration` (seconds) across active videos. NULL durations skipped. */
  sumDuration(): number
  /** Sum of `fileSize` (bytes) across active videos. NULL sizes skipped. */
  sumFileSize(): number
  /**
   * For each of the last `days` days (UTC), the count of active videos whose
   * `downloadDate` falls on that day. Returns one row per day (zero-filled).
   */
  findDownloadCountsByDay(days: number): { date: string; count: number }[]
  /**
   * Top-N creators by active-video count. Returns at most `limit` rows
   * sorted by count desc.
   */
  findTopCreators(limit: number): { creatorId: string; videoCount: number }[]
}
