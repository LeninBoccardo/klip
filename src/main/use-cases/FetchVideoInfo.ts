import type { IVideoDownloader } from '@domain/ports'
import type { VideoInfo } from '@domain/types'
import type { IFetchVideoInfo } from './IFetchVideoInfo'

/**
 * Pre-flight video metadata fetching.
 *
 * Validates a URL by calling yt-dlp's --dump-json mode and returns
 * structured metadata (title, channel, duration, thumbnail URL) without
 * downloading the actual video file.
 *
 * The UI will use this to show a preview/confirmation step before
 * committing to a full download.
 */
export class FetchVideoInfo implements IFetchVideoInfo {
  constructor(private downloader: IVideoDownloader) {}

  async execute(url: string): Promise<VideoInfo> {
    if (!url || url.trim().length === 0) {
      throw new Error('URL is required')
    }

    return this.downloader.fetchInfo(url.trim())
  }
}
