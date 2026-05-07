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
  RegisterCreator: 'register-creator',

  // ── Videos ──
  GetVideosPaginated: 'get-videos-paginated',
  GetVideoById: 'get-video-by-id',
  DeleteVideo: 'delete-video',
  RestoreVideo: 'restore-video',
  FetchVideoDetail: 'fetch-video-detail',
  EnrichAllVideos: 'enrich-all-videos',
  GetTranscript: 'get-transcript',
  FetchVideoComments: 'fetch-video-comments',
  MoveVideosToCreator: 'move-videos-to-creator',

  // ── Cuts ──
  GetCutsPaginated: 'get-cuts-paginated',
  GetCutById: 'get-cut-by-id',
  GetCutsByTags: 'get-cuts-by-tags',
  DeleteCut: 'delete-cut',
  RestoreCut: 'restore-cut',

  // ── Search ──
  SearchAll: 'search-all',
  SearchTranscripts: 'search-transcripts',

  // ── Shell ──
  OpenMediaExternally: 'open-media-externally',
  OpenPathInShell: 'open-path-in-shell',
  OpenLogFolder: 'open-log-folder',
  OpenExternalUrl: 'open-external-url',
  RevealEntityInFolder: 'reveal-entity-in-folder',
  RevealCreatorFolder: 'reveal-creator-folder',

  // ── Stats ──
  GetStorageStats: 'get-storage-stats',
  GetLibraryStats: 'get-library-stats',

  // ── Collections ──
  CollectionsPaginated: 'collections-paginated',
  CollectionById: 'collection-by-id',
  CollectionGetItems: 'collection-get-items',
  CollectionCreate: 'collection-create',
  CollectionRename: 'collection-rename',
  CollectionDelete: 'collection-delete',
  CollectionAddItem: 'collection-add-item',
  CollectionRemoveItem: 'collection-remove-item',
  CollectionReorder: 'collection-reorder',

  // ── Tags ──
  GetAllDistinctTags: 'get-all-distinct-tags',
  BulkUpdateTags: 'bulk-update-tags',
  RenameTagGlobally: 'rename-tag-globally',
  DeleteTagGlobally: 'delete-tag-globally',

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

  // ── Updater ──
  CheckForUpdates: 'check-for-updates',
  InstallUpdate: 'install-update',
  GetUpdaterStatus: 'get-updater-status',

  // ── Editor (lightweight in-app trim) ──
  EditorOpenWindow: 'editor-open-window',
  EditorStartRender: 'editor-start-render',
  EditorCancelRender: 'editor-cancel-render',
  EditorGetSession: 'editor-get-session',
  EditorFindSessionBySource: 'editor-find-session-by-source',

  // ── Push events (webContents.send → ipcRenderer.on) ──
  DbUpdated: 'db-updated',
  DownloadProgress: 'download-progress',
  MigrateRootProgress: 'migrate-root-progress',
  UpdaterStatus: 'updater-status',
  EnrichProgress: 'enrich-progress',
  RenderProgress: 'render-progress'
} as const

/** Union of all IPC channel name values */
export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]
