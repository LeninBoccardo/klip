import { ipcMain } from 'electron'
import type { IFetchVideoInfo } from '@use-cases/IFetchVideoInfo'
import type { IDownloadVideo } from '@use-cases/IDownloadVideo'
import type { IProbeMediaFile } from '@use-cases/IProbeMediaFile'
import type { VideoInfo, DownloadVideoResult, MediaProbeResult } from '@shared/types'
import { IpcChannels } from '@shared/ipc-channels'

/**
 * IPC controller for download and media-probe features.
 *
 * Registers:
 *   - `fetch-video-info`  → pre-flight metadata lookup
 *   - `download-video`    → enqueue a video download
 *   - `cancel-download`   → cancel an in-progress download
 *   - `probe-media-file`  → extract metadata from a local file
 */
export function registerDownloadController(
  fetchVideoInfo: IFetchVideoInfo,
  downloadVideo: IDownloadVideo,
  probeMediaFile: IProbeMediaFile
): void {
  ipcMain.handle(IpcChannels.FetchVideoInfo, async (_event, url: string): Promise<VideoInfo> => {
    return fetchVideoInfo.execute(url)
  })

  ipcMain.handle(
    IpcChannels.DownloadVideo,
    async (_event, url: string, creatorName: string): Promise<DownloadVideoResult> => {
      return downloadVideo.execute({ url, creatorName })
    }
  )

  ipcMain.handle(IpcChannels.CancelDownload, async (_event, downloadId: string): Promise<void> => {
    downloadVideo.cancel(downloadId)
  })

  ipcMain.handle(
    IpcChannels.ProbeMediaFile,
    async (_event, filePath: string): Promise<MediaProbeResult> => {
      return probeMediaFile.execute(filePath)
    }
  )
}
