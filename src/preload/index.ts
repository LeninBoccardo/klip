import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IpcChannels } from '@shared/ipc-channels'
import type { DownloadProgress, MigrateRootProgress } from '@shared/types'
import { createTypedInvoker } from './create-typed-invoker'

// Custom APIs for renderer
const api = {
  // ── Reconciliation ──
  reconcile: createTypedInvoker('reconcile'),

  // ── Download & Media ──
  fetchVideoInfo: createTypedInvoker('fetch-video-info'),
  downloadVideo: createTypedInvoker('download-video'),
  cancelDownload: createTypedInvoker('cancel-download'),
  probeMediaFile: createTypedInvoker('probe-media-file'),
  fetchChannelInfo: createTypedInvoker('fetch-channel-info'),

  // ── Creators ──
  getCreatorsPaginated: createTypedInvoker('get-creators-paginated'),
  getCreatorById: createTypedInvoker('get-creator-by-id'),
  deleteCreator: createTypedInvoker('delete-creator'),
  restoreCreator: createTypedInvoker('restore-creator'),

  // ── Videos ──
  getVideosPaginated: createTypedInvoker('get-videos-paginated'),
  getVideoById: createTypedInvoker('get-video-by-id'),
  deleteVideo: createTypedInvoker('delete-video'),
  restoreVideo: createTypedInvoker('restore-video'),
  fetchVideoDetail: createTypedInvoker('fetch-video-detail'),
  enrichAllVideos: createTypedInvoker('enrich-all-videos'),
  getTranscript: createTypedInvoker('get-transcript'),

  // ── Cuts ──
  getCutsPaginated: createTypedInvoker('get-cuts-paginated'),
  getCutById: createTypedInvoker('get-cut-by-id'),
  getCutsByTags: createTypedInvoker('get-cuts-by-tags'),
  deleteCut: createTypedInvoker('delete-cut'),
  restoreCut: createTypedInvoker('restore-cut'),

  // ── Settings ──
  getSettings: createTypedInvoker('get-settings'),
  getSetting: createTypedInvoker('get-setting'),
  setSetting: createTypedInvoker('set-setting'),
  migrateRoot: createTypedInvoker('migrate-root'),
  selectFolder: createTypedInvoker('select-folder'),

  // ── Audit Log ──
  getAuditLogByEntity: createTypedInvoker('get-audit-log-by-entity'),
  getAuditLogRecent: createTypedInvoker('get-audit-log-recent'),

  // ── Operations ──
  getOperationById: createTypedInvoker('get-operation-by-id'),
  getOperationsByStatus: createTypedInvoker('get-operations-by-status'),

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
  },
  onMigrateRootProgress: (
    callback: (_event: unknown, data: MigrateRootProgress) => void
  ): (() => void) => {
    ipcRenderer.on(IpcChannels.MigrateRootProgress, callback)
    return (): void => {
      ipcRenderer.removeListener(IpcChannels.MigrateRootProgress, callback)
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
