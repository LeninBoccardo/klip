import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IpcChannels } from '@shared/ipc-channels'
import type {
  ReconcileResult,
  VideoInfo,
  DownloadVideoResult,
  MediaProbeResult,
  DownloadProgress,
  PaginationParams,
  PaginatedResult,
  VideoQueryParams,
  CutQueryParams
} from '@shared/types'
import type { CreatorDto, VideoDto, CutDto } from '@shared/dtos'

// Custom APIs for renderer
const api = {
  // ── Reconciliation ──
  reconcile: (): Promise<ReconcileResult> => ipcRenderer.invoke(IpcChannels.Reconcile),

  // ── Download & Media ──
  fetchVideoInfo: (url: string): Promise<VideoInfo> =>
    ipcRenderer.invoke(IpcChannels.FetchVideoInfo, url),
  downloadVideo: (url: string, creatorName: string): Promise<DownloadVideoResult> =>
    ipcRenderer.invoke(IpcChannels.DownloadVideo, url, creatorName),
  cancelDownload: (downloadId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.CancelDownload, downloadId),
  probeMediaFile: (filePath: string): Promise<MediaProbeResult> =>
    ipcRenderer.invoke(IpcChannels.ProbeMediaFile, filePath),

  // ── Creators ──
  getCreatorsPaginated: (params: PaginationParams): Promise<PaginatedResult<CreatorDto>> =>
    ipcRenderer.invoke(IpcChannels.GetCreatorsPaginated, params),
  getCreatorById: (id: string): Promise<CreatorDto | null> =>
    ipcRenderer.invoke(IpcChannels.GetCreatorById, id),
  deleteCreator: (id: string): Promise<void> => ipcRenderer.invoke(IpcChannels.DeleteCreator, id),
  restoreCreator: (id: string): Promise<void> => ipcRenderer.invoke(IpcChannels.RestoreCreator, id),

  // ── Videos ──
  getVideosPaginated: (params: VideoQueryParams): Promise<PaginatedResult<VideoDto>> =>
    ipcRenderer.invoke(IpcChannels.GetVideosPaginated, params),
  getVideoById: (id: string): Promise<VideoDto | null> =>
    ipcRenderer.invoke(IpcChannels.GetVideoById, id),
  deleteVideo: (id: string): Promise<void> => ipcRenderer.invoke(IpcChannels.DeleteVideo, id),
  restoreVideo: (id: string): Promise<void> => ipcRenderer.invoke(IpcChannels.RestoreVideo, id),

  // ── Cuts ──
  getCutsPaginated: (params: CutQueryParams): Promise<PaginatedResult<CutDto>> =>
    ipcRenderer.invoke(IpcChannels.GetCutsPaginated, params),
  getCutById: (id: string): Promise<CutDto | null> =>
    ipcRenderer.invoke(IpcChannels.GetCutById, id),
  getCutsByTags: (tags: string[]): Promise<CutDto[]> =>
    ipcRenderer.invoke(IpcChannels.GetCutsByTags, tags),
  deleteCut: (id: string): Promise<void> => ipcRenderer.invoke(IpcChannels.DeleteCut, id),
  restoreCut: (id: string): Promise<void> => ipcRenderer.invoke(IpcChannels.RestoreCut, id),

  // ── Settings ──
  getSettings: (): Promise<Record<string, string>> => ipcRenderer.invoke(IpcChannels.GetSettings),
  getSetting: (key: string): Promise<string | null> =>
    ipcRenderer.invoke(IpcChannels.GetSetting, key),
  setSetting: (key: string, value: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.SetSetting, key, value),

  // ── Push event listeners ──
  onDownloadProgress: (
    callback: (_event: unknown, data: DownloadProgress) => void
  ): (() => void) => {
    ipcRenderer.on(IpcChannels.DownloadProgress, callback)
    return (): void => {
      ipcRenderer.removeListener(IpcChannels.DownloadProgress, callback)
    }
  },
  onDbUpdated: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on(IpcChannels.DbUpdated, handler)
    return (): void => {
      ipcRenderer.removeListener(IpcChannels.DbUpdated, handler)
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
