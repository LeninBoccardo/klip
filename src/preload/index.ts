import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IpcChannels } from '@shared/ipc-channels'
import type {
  DownloadProgress,
  EnrichProgress,
  MigrateRootProgress,
  UpdaterStatus,
  DbUpdatedPayload
} from '@shared/types'
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
  registerCreator: createTypedInvoker('register-creator'),

  // ── Videos ──
  getVideosPaginated: createTypedInvoker('get-videos-paginated'),
  getVideoById: createTypedInvoker('get-video-by-id'),
  deleteVideo: createTypedInvoker('delete-video'),
  restoreVideo: createTypedInvoker('restore-video'),
  fetchVideoDetail: createTypedInvoker('fetch-video-detail'),
  enrichAllVideos: createTypedInvoker('enrich-all-videos'),
  getTranscript: createTypedInvoker('get-transcript'),
  fetchVideoComments: createTypedInvoker('fetch-video-comments'),
  moveVideosToCreator: createTypedInvoker('move-videos-to-creator'),

  // ── Cuts ──
  getCutsPaginated: createTypedInvoker('get-cuts-paginated'),
  getCutById: createTypedInvoker('get-cut-by-id'),
  getCutsByTags: createTypedInvoker('get-cuts-by-tags'),
  deleteCut: createTypedInvoker('delete-cut'),
  restoreCut: createTypedInvoker('restore-cut'),

  // ── Collections ──
  getCollectionsPaginated: createTypedInvoker('collections-paginated'),
  getCollectionById: createTypedInvoker('collection-by-id'),
  getCollectionItems: createTypedInvoker('collection-get-items'),
  createCollection: createTypedInvoker('collection-create'),
  renameCollection: createTypedInvoker('collection-rename'),
  deleteCollection: createTypedInvoker('collection-delete'),
  addToCollection: createTypedInvoker('collection-add-item'),
  removeFromCollection: createTypedInvoker('collection-remove-item'),
  reorderCollection: createTypedInvoker('collection-reorder'),

  // ── Search ──
  searchAll: createTypedInvoker('search-all'),
  searchTranscripts: createTypedInvoker('search-transcripts'),

  // ── Shell ──
  openMediaExternally: createTypedInvoker('open-media-externally'),

  // ── Tags ──
  getAllDistinctTags: createTypedInvoker('get-all-distinct-tags'),
  bulkUpdateTags: createTypedInvoker('bulk-update-tags'),
  renameTagGlobally: createTypedInvoker('rename-tag-globally'),
  deleteTagGlobally: createTypedInvoker('delete-tag-globally'),

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

  // ── Updater ──
  checkForUpdates: createTypedInvoker('check-for-updates'),
  installUpdate: createTypedInvoker('install-update'),
  getUpdaterStatus: createTypedInvoker('get-updater-status'),

  // ── Push event listeners ──
  onDownloadProgress: (
    callback: (_event: unknown, data: DownloadProgress) => void
  ): (() => void) => {
    ipcRenderer.on(IpcChannels.DownloadProgress, callback)
    return (): void => {
      ipcRenderer.removeListener(IpcChannels.DownloadProgress, callback)
    }
  },
  onDbUpdated: (callback: (_event: unknown, data: DbUpdatedPayload) => void): (() => void) => {
    ipcRenderer.on(IpcChannels.DbUpdated, callback)
    return (): void => {
      ipcRenderer.removeListener(IpcChannels.DbUpdated, callback)
    }
  },
  onMigrateRootProgress: (
    callback: (_event: unknown, data: MigrateRootProgress) => void
  ): (() => void) => {
    ipcRenderer.on(IpcChannels.MigrateRootProgress, callback)
    return (): void => {
      ipcRenderer.removeListener(IpcChannels.MigrateRootProgress, callback)
    }
  },
  onUpdaterStatus: (callback: (_event: unknown, data: UpdaterStatus) => void): (() => void) => {
    ipcRenderer.on(IpcChannels.UpdaterStatus, callback)
    return (): void => {
      ipcRenderer.removeListener(IpcChannels.UpdaterStatus, callback)
    }
  },
  onEnrichProgress: (callback: (_event: unknown, data: EnrichProgress) => void): (() => void) => {
    ipcRenderer.on(IpcChannels.EnrichProgress, callback)
    return (): void => {
      ipcRenderer.removeListener(IpcChannels.EnrichProgress, callback)
    }
  }
}

// `contextIsolation: true` is set explicitly in main/index.ts (and is the
// Electron-41 default). The non-isolated fallback was deleted alongside the
// `sandbox: true` flip — under sandbox + isolation, `process.contextIsolated`
// is always true here and the alternate `window.electron = …` path is dead.
//
// No try/catch around exposeInMainWorld: the previous wrapper silently swallowed
// real preload exceptions and left the renderer with `window.api === undefined`,
// which then produced opaque "Cannot read properties of undefined" errors at
// every IPC call site. Letting it throw makes the failure visible in the
// terminal running `npm run dev`.
contextBridge.exposeInMainWorld('electron', electronAPI)
contextBridge.exposeInMainWorld('api', api)
