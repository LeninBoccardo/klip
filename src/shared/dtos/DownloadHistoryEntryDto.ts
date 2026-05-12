/**
 * Wire-format mirror of {@link DownloadHistoryEntry}.
 *
 * The shape matches the domain entity 1:1 today; the DTO exists so future
 * domain changes (renames, additional persistence-only fields, etc.) can
 * happen without churn at the IPC boundary.
 */
export interface DownloadHistoryEntryDto {
  id: string
  youtubeUrl: string
  videoId: string | null
  videoTitle: string | null
  thumbnailUrl: string | null
  creatorFolderName: string | null
  status: 'success' | 'error'
  errorMessage: string | null
  errorRetryable: boolean
  finishedAt: string
}
