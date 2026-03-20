import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  ReconcileResult,
  DownloadVideoResult,
  VideoInfo,
  DownloadProgress,
  MediaProbeResult,
  PaginationParams,
  PaginatedResult,
  VideoQueryParams,
  CutQueryParams
} from '@shared/types'
import type { CreatorDto, VideoDto, CutDto } from '@shared/dtos'

interface KlipAPI {
  // ── Reconciliation ──
  reconcile(): Promise<ReconcileResult>

  // ── Download & Media ──
  fetchVideoInfo(url: string): Promise<VideoInfo>
  downloadVideo(url: string, creatorName: string): Promise<DownloadVideoResult>
  cancelDownload(downloadId: string): Promise<void>
  probeMediaFile(filePath: string): Promise<MediaProbeResult>

  // ── Creators ──
  getCreatorsPaginated(params: PaginationParams): Promise<PaginatedResult<CreatorDto>>
  getCreatorById(id: string): Promise<CreatorDto | null>
  deleteCreator(id: string): Promise<void>
  restoreCreator(id: string): Promise<void>

  // ── Videos ──
  getVideosPaginated(params: VideoQueryParams): Promise<PaginatedResult<VideoDto>>
  getVideoById(id: string): Promise<VideoDto | null>
  deleteVideo(id: string): Promise<void>
  restoreVideo(id: string): Promise<void>

  // ── Cuts ──
  getCutsPaginated(params: CutQueryParams): Promise<PaginatedResult<CutDto>>
  getCutById(id: string): Promise<CutDto | null>
  getCutsByTags(tags: string[]): Promise<CutDto[]>
  deleteCut(id: string): Promise<void>
  restoreCut(id: string): Promise<void>

  // ── Settings ──
  getSettings(): Promise<Record<string, string>>
  getSetting(key: string): Promise<string | null>
  setSetting(key: string, value: string): Promise<void>

  // ── Push event listeners ──
  /** Subscribe to download progress events; returns an unsubscribe function */
  onDownloadProgress(callback: (event: unknown, data: DownloadProgress) => void): () => void
  /** Subscribe to db-updated events; returns an unsubscribe function */
  onDbUpdated(callback: () => void): () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: KlipAPI
  }
}
