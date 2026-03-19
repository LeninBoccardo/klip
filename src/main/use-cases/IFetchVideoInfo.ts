import type { VideoInfo } from '@domain/types'

/**
 * Port for pre-flight video metadata fetching.
 * Validates a URL and returns metadata without downloading.
 */
export interface IFetchVideoInfo {
  execute(url: string): Promise<VideoInfo>
}
