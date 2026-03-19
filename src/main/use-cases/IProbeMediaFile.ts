import type { MediaProbeResult } from '@domain/types'

/**
 * Port for on-demand media file probing.
 * Returns duration, resolution, and file size for a local media file.
 */
export interface IProbeMediaFile {
  execute(filePath: string): Promise<MediaProbeResult>
}
