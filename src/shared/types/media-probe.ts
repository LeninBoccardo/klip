/** Result from probing a media file with ffprobe */
export interface MediaProbeResult {
  /** Duration in seconds */
  duration: number | null
  /** Resolution string, e.g. "1920x1080" */
  resolution: string | null
  /** File size in bytes */
  fileSize: number | null
  /**
   * Frames per second, derived from the video stream's `r_frame_rate`
   * rational (e.g. "30000/1001" → 29.97). Null when there's no video stream
   * or the rate is unparseable/zero. Lets the editor frame-step by exactly one
   * frame instead of a hardcoded 1/30s (F71).
   */
  frameRate: number | null
}
