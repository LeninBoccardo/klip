import type { DownloadHistoryEntry } from '@domain/entities'

export interface IListDownloadHistory {
  execute(limit: number): DownloadHistoryEntry[]
}
