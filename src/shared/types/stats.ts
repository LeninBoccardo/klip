/**
 * Total bytes consumed by tracked media files in the library, broken down
 * by entity. Sourced from the videos.fileSize and cuts.fileSize columns —
 * does not include thumbnails, transcripts, or untracked files on disk.
 */
export interface StorageStats {
  videosBytes: number
  cutsBytes: number
  totalBytes: number
}

/**
 * Aggregate snapshot for the dashboard. Bundled into a single IPC call so
 * the dashboard renders without N round-trips.
 */
export interface LibraryStats {
  creators: {
    total: number
    byStatus: Partial<Record<'active' | 'deleted' | 'missing', number>>
  }
  videos: {
    total: number
    byStatus: Partial<Record<'active' | 'deleted' | 'missing', number>>
    transcribed: number
    totalDuration: number
    totalSize: number
  }
  cuts: {
    total: number
    totalDuration: number
    totalSize: number
  }
  /** Last 30 days of download counts, oldest → newest, zero-filled. */
  downloadsByDay: { date: string; count: number }[]
  /** Top creators by active-video count (desc). */
  topCreators: { creatorId: string; name: string; videoCount: number }[]
  storage: StorageStats
}
