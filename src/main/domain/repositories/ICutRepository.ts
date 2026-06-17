import type { Cut } from '@domain/entities'
import type { PaginatedResult, EntityStatus, ProbeStatus } from '@domain/types'
import type { CutQueryParams } from '@shared/types'

export type { CutQueryParams } from '@shared/types'

export interface ICutRepository {
  findAll(): Cut[]
  findAllActive(): Cut[]
  findById(id: string): Cut | null
  findByCreatorId(creatorId: string): Cut[]
  findByVideoId(videoId: string): Cut[]
  /** Cheap id-only projection — see {@link IVideoRepository.findIdsByCreator}. */
  findIdsByCreator(creatorId: string): string[]
  findByTags(tags: string[]): Cut[]
  /**
   * Active cuts whose `title` contains the (case-insensitive) query as a
   * substring. Caller bounds the result via `limit`. Used by the global
   * search palette.
   */
  searchByTitle(query: string, limit: number): Cut[]
  /**
   * Returns every distinct tag used by an active cut, with the number of
   * active cuts that carry it. Tags are case-sensitive (the canonical form
   * is whatever was written to the JSON column).
   */
  getAllDistinctTags(): { tag: string; count: number }[]
  findByProbeStatus(status: ProbeStatus): Cut[]
  upsert(cut: Cut): void
  /** See {@link ICreatorRepository.upsertWithPrevious} — same semantics. */
  upsertWithPrevious(cut: Cut, previous: Cut | null): void
  updateStatus(id: string, status: EntityStatus, deletedAt: string | null): void
  updateProbeStatus(id: string, probeStatus: ProbeStatus): void
  /** See {@link IVideoRepository.updateProbeResult} — same column-scoped semantics. */
  updateProbeResult(
    id: string,
    result: {
      duration: number | null
      resolution: string | null
      fileSize: number | null
      probeStatus: ProbeStatus
    }
  ): void
  delete(id: string): void
  findPaginated(params: CutQueryParams): PaginatedResult<Cut>
  /** Bulk-replace a path prefix in filePath and thumbnailPath columns */
  updateFilePathPrefix(oldPrefix: string, newPrefix: string): void
  // ── Aggregates (used by dashboard + storage stats) ──
  /** Total count of active cuts. */
  count(): number
  /** Sum of `duration` (seconds) across active cuts. NULL durations skipped. */
  sumDuration(): number
  /** Sum of `fileSize` (bytes) across active cuts. NULL sizes skipped. */
  sumFileSize(): number
}
