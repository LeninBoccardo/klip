/** Result from probing a media file with ffprobe */
export interface MediaProbeResult {
  /** Duration in seconds */
  duration: number | null
  /** Resolution string, e.g. "1920x1080" */
  resolution: string | null
  /** File size in bytes */
  fileSize: number | null
}
