import type { VideoDetailWithTranscript } from '@shared/types'

/**
 * Port for fetching extended per-video metadata + transcript on demand.
 * Persists the result on the video entity and returns the parsed transcript text.
 */
export interface IFetchVideoDetail {
  execute(videoId: string): Promise<VideoDetailWithTranscript>
}
