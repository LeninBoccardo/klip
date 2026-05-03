export interface MoveVideosToCreatorRequest {
  videoIds: string[]
  targetCreatorId: string
}

export interface MoveVideosToCreatorResult {
  /** Number of videos successfully moved (DB + disk) */
  moved: number
  /**
   * Number of videos that were skipped without an error — already in the
   * target creator, not active, or not found in the DB.
   */
  skipped: number
  /** Per-video error messages keyed by videoId. */
  errors: Record<string, string>
}
