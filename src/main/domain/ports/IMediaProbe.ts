import type { MediaProbeResult } from '@domain/types'

/**
 * Abstraction over a media metadata probe tool (ffprobe).
 * Used to extract duration, resolution, and file size from local media files.
 */
export interface IMediaProbe {
  /** Probe a local media file and return its metadata */
  probe(filePath: string): Promise<MediaProbeResult>
}
