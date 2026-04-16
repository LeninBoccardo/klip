import type { IFetchVideoInfo } from '@use-cases/IFetchVideoInfo'
import type { IDownloadVideo } from '@use-cases/IDownloadVideo'
import type { IProbeMediaFile } from '@use-cases/IProbeMediaFile'
import type { IFetchChannelInfo } from '@use-cases/IFetchChannelInfo'
import { createTypedHandler } from './create-typed-handler'

/**
 * IPC controller for download and media-probe features.
 *
 * Registers:
 *   - `fetch-video-info`    → pre-flight metadata lookup
 *   - `download-video`      → enqueue a video download
 *   - `cancel-download`     → cancel an in-progress download
 *   - `probe-media-file`    → extract metadata from a local file
 *   - `fetch-channel-info`  → fetch YouTube channel metadata
 */
export function registerDownloadController(
  fetchVideoInfo: IFetchVideoInfo,
  downloadVideo: IDownloadVideo,
  probeMediaFile: IProbeMediaFile,
  fetchChannelInfo: IFetchChannelInfo
): void {
  createTypedHandler('fetch-video-info', async (_event, url) => {
    return fetchVideoInfo.execute(url)
  })

  createTypedHandler('download-video', async (_event, url, creatorName) => {
    return downloadVideo.execute({ url, creatorName })
  })

  createTypedHandler('cancel-download', async (_event, downloadId) => {
    downloadVideo.cancel(downloadId)
  })

  createTypedHandler('probe-media-file', async (_event, filePath) => {
    return probeMediaFile.execute(filePath)
  })

  createTypedHandler('fetch-channel-info', async (_event, url) => {
    return fetchChannelInfo.execute(url)
  })
}
