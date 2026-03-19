import { ElectronAPI } from '@electron-toolkit/preload'
import { ReconcileResult } from '@use-cases/IReconcileDirectory'
import { VideoInfo, DownloadProgress, MediaProbeResult } from '@domain/types'
import { DownloadVideoResult } from '@use-cases/IDownloadVideo'

interface KlipAPI {
  reconcile(): Promise<ReconcileResult>
  fetchVideoInfo(url: string): Promise<VideoInfo>
  downloadVideo(url: string, creatorName: string): Promise<DownloadVideoResult>
  cancelDownload(downloadId: string): Promise<void>
  probeMediaFile(filePath: string): Promise<MediaProbeResult>
  /** Subscribe to download progress events; returns an unsubscribe function */
  onDownloadProgress(callback: (event: unknown, data: DownloadProgress) => void): () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: KlipAPI
  }
}
