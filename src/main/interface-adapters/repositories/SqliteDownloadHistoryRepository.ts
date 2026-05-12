import { desc, eq, lt } from 'drizzle-orm'
import type { AppDatabase } from '@main/framework-drivers/database'
import { downloadHistory } from '@main/framework-drivers/database/schema'
import type { DownloadHistoryEntry, DownloadHistoryStatus } from '@domain/entities'
import type { IDownloadHistoryRepository } from '@domain/repositories'

type Row = typeof downloadHistory.$inferSelect

function mapRow(row: Row): DownloadHistoryEntry {
  return {
    id: row.id,
    youtubeUrl: row.youtubeUrl,
    videoId: row.videoId,
    videoTitle: row.videoTitle,
    thumbnailUrl: row.thumbnailUrl,
    creatorFolderName: row.creatorFolderName,
    status: row.status as DownloadHistoryStatus,
    errorMessage: row.errorMessage,
    errorRetryable: row.errorRetryable,
    finishedAt: row.finishedAt
  }
}

/**
 * Drizzle-backed implementation of the finished-downloads ledger.
 *
 * Append-only by design — there is no `update` and `delete` is only exposed
 * via the bounded `deleteOlderThan` retention hook. Treating the ledger as
 * immutable keeps retries from rewriting history and makes the rows usable
 * as a debugging trail.
 */
export class SqliteDownloadHistoryRepository implements IDownloadHistoryRepository {
  constructor(private db: AppDatabase) {}

  append(entry: DownloadHistoryEntry): void {
    this.db
      .insert(downloadHistory)
      .values({
        id: entry.id,
        youtubeUrl: entry.youtubeUrl,
        videoId: entry.videoId,
        videoTitle: entry.videoTitle,
        thumbnailUrl: entry.thumbnailUrl,
        creatorFolderName: entry.creatorFolderName,
        status: entry.status,
        errorMessage: entry.errorMessage,
        errorRetryable: entry.errorRetryable,
        finishedAt: entry.finishedAt
      })
      .run()
  }

  findRecent(limit: number): DownloadHistoryEntry[] {
    if (limit <= 0) return []
    return this.db
      .select()
      .from(downloadHistory)
      .orderBy(desc(downloadHistory.finishedAt))
      .limit(limit)
      .all()
      .map(mapRow)
  }

  findById(id: string): DownloadHistoryEntry | null {
    const row = this.db
      .select()
      .from(downloadHistory)
      .where(eq(downloadHistory.id, id))
      .get()
    return row ? mapRow(row) : null
  }

  deleteOlderThan(isoDate: string): number {
    const result = this.db
      .delete(downloadHistory)
      .where(lt(downloadHistory.finishedAt, isoDate))
      .run()
    return Number(result.changes ?? 0)
  }
}
