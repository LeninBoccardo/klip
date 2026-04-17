/**
 * Single source of truth for all IPC channel names.
 * Used by main-process controllers and the preload bridge.
 */
export const IpcChannels = {
  // ── Request/Response (ipcMain.handle ↔ ipcRenderer.invoke) ──
  Reconcile: 'reconcile',
  FetchVideoInfo: 'fetch-video-info',
  DownloadVideo: 'download-video',
  CancelDownload: 'cancel-download',
  ProbeMediaFile: 'probe-media-file',

  // ── Channel ──
  FetchChannelInfo: 'fetch-channel-info',

  // ── Creators ──
  GetCreatorsPaginated: 'get-creators-paginated',
  GetCreatorById: 'get-creator-by-id',
  DeleteCreator: 'delete-creator',
  RestoreCreator: 'restore-creator',

  // ── Videos ──
  GetVideosPaginated: 'get-videos-paginated',
  GetVideoById: 'get-video-by-id',
  DeleteVideo: 'delete-video',
  RestoreVideo: 'restore-video',

  // ── Cuts ──
  GetCutsPaginated: 'get-cuts-paginated',
  GetCutById: 'get-cut-by-id',
  GetCutsByTags: 'get-cuts-by-tags',
  DeleteCut: 'delete-cut',
  RestoreCut: 'restore-cut',

  // ── Settings ──
  GetSettings: 'get-settings',
  GetSetting: 'get-setting',
  SetSetting: 'set-setting',
  MigrateRoot: 'migrate-root',
  SelectFolder: 'select-folder',

  // ── Audit Log ──
  GetAuditLogByEntity: 'get-audit-log-by-entity',
  GetAuditLogRecent: 'get-audit-log-recent',

  // ── Operations ──
  GetOperationById: 'get-operation-by-id',
  GetOperationsByStatus: 'get-operations-by-status',

  // ── Push events (webContents.send → ipcRenderer.on) ──
  DbUpdated: 'db-updated',
  DownloadProgress: 'download-progress',
  MigrateRootProgress: 'migrate-root-progress'
} as const

/** Union of all IPC channel name values */
export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]
