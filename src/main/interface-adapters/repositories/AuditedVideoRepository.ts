import type { Video } from '@domain/entities'
import type { IVideoRepository, VideoQueryParams, VideoDetailUpdate } from '@domain/repositories'
import type { IAuditLogRepository } from '@domain/repositories'
import type { ITransactionScope } from '@domain/ports'
import type { PaginatedResult, EntityStatus, ProbeStatus } from '@domain/types'
import { diffObjects } from './diff-objects'

/**
 * Fields written by `EnrichMediaMetadata` after ffprobe completes. When the
 * diff between two videos consists ENTIRELY of these keys, the update is
 * pure enrichment (no user-meaningful change) and we skip the audit entry
 * so the activity feed isn't peppered with "Atualizado" lines that just
 * mean "ffprobe finished". `updatedAt` is already filtered in diffObjects.
 */
const ENRICHMENT_ONLY_FIELDS = new Set([
  'probeStatus',
  'duration',
  'resolution',
  'fileSize',
  'frameRate'
])

function isEnrichmentOnly(changesJson: string): boolean {
  try {
    const changes = JSON.parse(changesJson) as Record<string, unknown>
    const keys = Object.keys(changes)
    if (keys.length === 0) return false
    return keys.every((k) => ENRICHMENT_ONLY_FIELDS.has(k))
  } catch {
    return false
  }
}

/**
 * Decorator that wraps an IVideoRepository and writes audit log entries
 * for every mutation. Reads are delegated directly.
 *
 * Each mutation runs inside an `ITransactionScope.run(...)` so the inner write
 * and the audit append are committed atomically.
 */
export class AuditedVideoRepository implements IVideoRepository {
  constructor(
    private inner: IVideoRepository,
    private auditLog: IAuditLogRepository,
    private transaction: ITransactionScope
  ) {}

  findAll(): Video[] {
    return this.inner.findAll()
  }

  findAllActive(): Video[] {
    return this.inner.findAllActive()
  }

  findById(id: string): Video | null {
    return this.inner.findById(id)
  }

  findByIds(ids: string[]): Video[] {
    return this.inner.findByIds(ids)
  }

  findByYoutubeVideoId(youtubeVideoId: string): Video | null {
    return this.inner.findByYoutubeVideoId(youtubeVideoId)
  }

  findByCreatorId(creatorId: string): Video[] {
    return this.inner.findByCreatorId(creatorId)
  }

  findIdsByCreator(creatorId: string): string[] {
    return this.inner.findIdsByCreator(creatorId)
  }

  findByProbeStatus(status: ProbeStatus): Video[] {
    return this.inner.findByProbeStatus(status)
  }

  findNeedingDetail(): Video[] {
    return this.inner.findNeedingDetail()
  }

  findMissingForRecovery(): Video[] {
    return this.inner.findMissingForRecovery()
  }

  findByTags(tags: string[]): Video[] {
    return this.inner.findByTags(tags)
  }

  searchByTitle(query: string, limit: number): Video[] {
    return this.inner.searchByTitle(query, limit)
  }

  getAllDistinctTags(): { tag: string; count: number }[] {
    return this.inner.getAllDistinctTags()
  }

  upsert(video: Video): void {
    // Caller didn't supply prior state; read it for the audit diff.
    this.upsertWithPrevious(video, this.inner.findById(video.id))
  }

  upsertWithPrevious(video: Video, previous: Video | null): void {
    this.transaction.run(() => {
      this.inner.upsert(video)

      const now = new Date().toISOString()
      if (!previous) {
        this.auditLog.append({
          entityType: 'video',
          entityId: video.id,
          action: 'created',
          changes: null,
          createdAt: now
        })
      } else {
        const changes = diffObjects(
          previous as unknown as Record<string, unknown>,
          video as unknown as Record<string, unknown>
        )
        // Skip audit entries that ONLY contain ffprobe-enrichment fields.
        // These fire ~1s after every download (EnrichMediaMetadata runs the
        // probe, writes back duration/resolution/fileSize/probeStatus) and
        // are implementation detail — the user sees the enriched values in
        // the row itself, so a separate "Atualizado" line in the activity
        // feed adds noise without information. Genuine updates that
        // happen to TOUCH a probe field plus anything else still audit
        // normally.
        if (changes && !isEnrichmentOnly(changes)) {
          this.auditLog.append({
            entityType: 'video',
            entityId: video.id,
            action: 'updated',
            changes,
            createdAt: now
          })
        }
      }
    })
  }

  updateStatus(id: string, status: EntityStatus, deletedAt: string | null): void {
    this.transaction.run(() => {
      const existing = this.inner.findById(id)
      this.inner.updateStatus(id, status, deletedAt)

      this.auditLog.append({
        entityType: 'video',
        entityId: id,
        action: 'status_changed',
        changes: JSON.stringify({
          status: { old: existing?.status ?? null, new: status },
          deletedAt: { old: existing?.deletedAt ?? null, new: deletedAt }
        }),
        createdAt: new Date().toISOString()
      })
    })
  }

  updateProbeStatus(id: string, probeStatus: ProbeStatus): void {
    this.transaction.run(() => {
      const existing = this.inner.findById(id)
      this.inner.updateProbeStatus(id, probeStatus)

      this.auditLog.append({
        entityType: 'video',
        entityId: id,
        action: 'probe_status_changed',
        changes: JSON.stringify({
          probeStatus: { old: existing?.probeStatus ?? null, new: probeStatus }
        }),
        createdAt: new Date().toISOString()
      })
    })
  }

  updateProbeResult(
    id: string,
    result: {
      duration: number | null
      resolution: string | null
      fileSize: number | null
      frameRate: number | null
      probeStatus: ProbeStatus
    }
  ): void {
    // Intentionally NOT audited. updateProbeResult writes exactly the
    // enrichment fields (probeStatus/duration/resolution/fileSize/frameRate), and those
    // are precisely the keys ENRICHMENT_ONLY_FIELDS suppresses on the upsert
    // path — pure ffprobe enrichment fires ~1s after every download and would
    // otherwise pepper the activity feed with empty "updated" lines. Probe
    // FAILURES still audit via updateProbeStatus. Single write, no transaction
    // needed.
    this.inner.updateProbeResult(id, result)
  }

  updateDetail(id: string, detail: VideoDetailUpdate): void {
    this.transaction.run(() => {
      const existing = this.inner.findById(id)
      this.inner.updateDetail(id, detail)

      // Mirror the upsert path's audit behavior. Detail-fetch columns are NOT
      // in ENRICHMENT_ONLY_FIELDS (unlike ffprobe results), so a genuine detail
      // change is a user-meaningful "updated" entry. We diff the prior row
      // against it-plus-the-scoped-columns so the changes JSON matches what the
      // old full-row upsert produced — same fields, same suppression rule. A
      // missing prior row shouldn't happen (detail fetch presupposes the video
      // exists), so there is nothing to audit.
      if (!existing) return
      const after = { ...existing, ...detail }
      const changes = diffObjects(
        existing as unknown as Record<string, unknown>,
        after as unknown as Record<string, unknown>
      )
      if (changes && !isEnrichmentOnly(changes)) {
        this.auditLog.append({
          entityType: 'video',
          entityId: id,
          action: 'updated',
          changes,
          createdAt: new Date().toISOString()
        })
      }
    })
  }

  delete(id: string): void {
    this.transaction.run(() => {
      this.inner.delete(id)

      this.auditLog.append({
        entityType: 'video',
        entityId: id,
        action: 'deleted',
        changes: null,
        createdAt: new Date().toISOString()
      })
    })
  }

  findPaginated(params: VideoQueryParams): PaginatedResult<Video> {
    return this.inner.findPaginated(params)
  }

  updateFilePathPrefix(oldPrefix: string, newPrefix: string): void {
    this.transaction.run(() => {
      this.inner.updateFilePathPrefix(oldPrefix, newPrefix)

      this.auditLog.append({
        entityType: 'video',
        entityId: '*',
        action: 'bulk_path_update',
        changes: JSON.stringify({ oldPrefix, newPrefix }),
        createdAt: new Date().toISOString()
      })
    })
  }

  // ── Aggregate pass-throughs (read-only, no audit needed) ──

  count(): number {
    return this.inner.count()
  }

  countByStatus(): Partial<Record<EntityStatus, number>> {
    return this.inner.countByStatus()
  }

  countTranscribed(): number {
    return this.inner.countTranscribed()
  }

  sumDuration(): number {
    return this.inner.sumDuration()
  }

  sumFileSize(): number {
    return this.inner.sumFileSize()
  }

  findDownloadCountsByDay(days: number): { date: string; count: number }[] {
    return this.inner.findDownloadCountsByDay(days)
  }

  findTopCreators(limit: number): { creatorId: string; videoCount: number }[] {
    return this.inner.findTopCreators(limit)
  }
}
