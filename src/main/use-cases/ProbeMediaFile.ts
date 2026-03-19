import type { IMediaProbe } from '@domain/ports'
import type { MediaProbeResult } from '@domain/types'
import type { IProbeMediaFile } from './IProbeMediaFile'

/**
 * On-demand media file probing.
 *
 * Runs ffprobe against a local file and returns metadata
 * (duration, resolution, fileSize).
 *
 * Future: accept an entity ID to update the corresponding
 * Video or Cut record after probing.
 */
export class ProbeMediaFile implements IProbeMediaFile {
  constructor(private mediaProbe: IMediaProbe) {}

  async execute(filePath: string): Promise<MediaProbeResult> {
    if (!filePath || filePath.trim().length === 0) {
      throw new Error('File path is required')
    }

    return this.mediaProbe.probe(filePath.trim())
  }
}
