import type { IFetchVideoInfo } from '@use-cases/IFetchVideoInfo'
import type { IDownloadVideo } from '@use-cases/IDownloadVideo'
import type { IProbeMediaFile } from '@use-cases/IProbeMediaFile'
import type { IFetchChannelInfo } from '@use-cases/IFetchChannelInfo'
import type { RootPathRef } from '@domain/ports'
import { createTypedHandler } from './create-typed-handler'
import { isPathWithinRoot } from './path-containment'

/**
 * IPC controller for download and media-probe features.
 *
 * Registers:
 *   - `fetch-video-info`    → pre-flight metadata lookup
 *   - `download-video`      → enqueue a video download
 *   - `cancel-download`     → cancel an in-progress download
 *   - `probe-media-file`    → extract metadata from a local file (path
 *     contained under rootPath — the renderer can't probe arbitrary files)
 *   - `fetch-channel-info`  → fetch YouTube channel metadata
 */
export function registerDownloadController(
  fetchVideoInfo: IFetchVideoInfo,
  downloadVideo: IDownloadVideo,
  probeMediaFile: IProbeMediaFile,
  fetchChannelInfo: IFetchChannelInfo,
  rootPath: RootPathRef
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
    // Containment: legitimate callers always probe a file already tracked under
    // rootPath. Reject anything outside it so a compromised renderer can't probe
    // arbitrary files on disk (existence + media metadata disclosure).
    if (!isPathWithinRoot(filePath, rootPath.value)) {
      throw new Error('File path is outside the configured root folder.')
    }
    return probeMediaFile.execute(filePath)
  })

  createTypedHandler('fetch-channel-info', async (_event, url) => {
    return fetchChannelInfo.execute(url)
  })
}
