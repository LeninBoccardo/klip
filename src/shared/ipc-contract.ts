import type {
  ReconcileResult,
  DownloadVideoResult,
  FetchChannelInfoResult,
  VideoInfo,
  MediaProbeResult,
  DownloadProgress,
  MigrateRootProgress,
  MigrateRootResult,
  PaginationParams,
  PaginatedResult,
  VideoQueryParams,
  CutQueryParams,
  VideoDetailWithTranscript,
  EnrichVideosResult,
  EnrichProgress,
  VideoCommentsResult,
  UpdaterStatus,
  DbUpdatedPayload,
  TagAggregation,
  BulkUpdateTagsRequest,
  BulkUpdateTagsResult,
  RenameTagGloballyResult,
  SearchAllResult,
  CreateCollectionRequest,
  RenameCollectionRequest,
  AddToCollectionRequest,
  AddToCollectionResult,
  RemoveFromCollectionRequest,
  ReorderCollectionRequest
} from './types'
import type {
  CreatorDto,
  VideoDto,
  CutDto,
  AuditEntryDto,
  OperationDto,
  CollectionDto,
  CollectionItemDto
} from './dtos'

/**
 * Typed map of every IPC channel to its parameter tuple and return type.
 * Keys match the string literal values defined in {@link IpcChannels}.
 * Provides compile-time safety for both the main-process handlers and the preload bridge.
 */
export interface IpcContract {
  // ── Download & Media ──
  reconcile: { params: []; result: ReconcileResult }
  'fetch-video-info': { params: [url: string]; result: VideoInfo }
  'download-video': {
    params: [url: string, creatorName: string]
    result: DownloadVideoResult
  }
  'cancel-download': { params: [downloadId: string]; result: void }
  'probe-media-file': { params: [filePath: string]; result: MediaProbeResult }
  'fetch-channel-info': { params: [url: string]; result: FetchChannelInfoResult }

  // ── Creators ──
  'get-creators-paginated': {
    params: [params: PaginationParams]
    result: PaginatedResult<CreatorDto>
  }
  'get-creator-by-id': { params: [id: string]; result: CreatorDto | null }
  'delete-creator': { params: [id: string]; result: void }
  'restore-creator': { params: [id: string]; result: void }

  // ── Videos ──
  'get-videos-paginated': {
    params: [params: VideoQueryParams]
    result: PaginatedResult<VideoDto>
  }
  'get-video-by-id': { params: [id: string]; result: VideoDto | null }
  'delete-video': { params: [id: string]; result: void }
  'restore-video': { params: [id: string]; result: void }
  'fetch-video-detail': { params: [videoId: string]; result: VideoDetailWithTranscript }
  'enrich-all-videos': { params: []; result: EnrichVideosResult }
  'get-transcript': { params: [videoId: string]; result: string | null }
  'fetch-video-comments': {
    params: [videoId: string, maxComments?: number]
    result: VideoCommentsResult
  }

  // ── Cuts ──
  'get-cuts-paginated': {
    params: [params: CutQueryParams]
    result: PaginatedResult<CutDto>
  }
  'get-cut-by-id': { params: [id: string]; result: CutDto | null }
  'get-cuts-by-tags': { params: [tags: string[]]; result: CutDto[] }
  'delete-cut': { params: [id: string]; result: void }
  'restore-cut': { params: [id: string]; result: void }

  // ── Search ──
  'search-all': {
    params: [query: string, limit?: number]
    result: SearchAllResult
  }

  // ── Shell ──
  // Open the resolved file for a (kind, id) pair in the OS default app.
  // Kind is restricted to 'video' | 'cut'; the main process resolves to the
  // canonical path via ResolveMediaUrl so the renderer never holds the raw
  // filesystem path. Returns the OS error string (empty on success).
  'open-media-externally': {
    params: [kind: 'video' | 'cut', id: string]
    result: { ok: boolean; error?: string }
  }

  // ── Collections ──
  'collections-paginated': {
    params: [params: PaginationParams]
    result: PaginatedResult<CollectionDto>
  }
  'collection-by-id': { params: [id: string]; result: CollectionDto | null }
  'collection-get-items': { params: [collectionId: string]; result: CollectionItemDto[] }
  'collection-create': { params: [request: CreateCollectionRequest]; result: CollectionDto }
  'collection-rename': { params: [request: RenameCollectionRequest]; result: CollectionDto }
  'collection-delete': { params: [id: string]; result: { deleted: boolean } }
  'collection-add-item': {
    params: [request: AddToCollectionRequest]
    result: AddToCollectionResult
  }
  'collection-remove-item': {
    params: [request: RemoveFromCollectionRequest]
    result: { removed: boolean }
  }
  'collection-reorder': {
    params: [request: ReorderCollectionRequest]
    result: { reordered: number }
  }

  // ── Tags ──
  'get-all-distinct-tags': { params: []; result: TagAggregation[] }
  'bulk-update-tags': {
    params: [request: BulkUpdateTagsRequest]
    result: BulkUpdateTagsResult
  }
  'rename-tag-globally': {
    params: [oldTag: string, newTag: string]
    result: RenameTagGloballyResult
  }

  // ── Settings ──
  'get-settings': { params: []; result: Record<string, string> }
  'get-setting': { params: [key: string]; result: string | null }
  'set-setting': { params: [key: string, value: string]; result: void }
  'migrate-root': { params: [newRootPath: string]; result: MigrateRootResult }
  'select-folder': { params: []; result: string | null }

  // ── Audit Log ──
  'get-audit-log-by-entity': {
    params: [entityType: string, entityId: string]
    result: AuditEntryDto[]
  }
  'get-audit-log-recent': {
    params: [limit: number]
    result: AuditEntryDto[]
  }

  // ── Operations ──
  'get-operation-by-id': {
    params: [id: string]
    result: OperationDto | null
  }
  'get-operations-by-status': {
    params: [status: string]
    result: OperationDto[]
  }

  // ── Updater ──
  'check-for-updates': { params: []; result: UpdaterStatus }
  'install-update': { params: []; result: void }
  'get-updater-status': { params: []; result: UpdaterStatus }

  // ── Push events (main → renderer) ──
  'db-updated': { params: [data: DbUpdatedPayload]; result: void }
  'download-progress': { params: [data: DownloadProgress]; result: void }
  'migrate-root-progress': { params: [data: MigrateRootProgress]; result: void }
  'updater-status': { params: [data: UpdaterStatus]; result: void }
  'enrich-progress': { params: [data: EnrichProgress]; result: void }
}

/** Channels that use ipcMain.handle (request/response pattern) */
export type InvokeChannel = Exclude<
  keyof IpcContract,
  | 'db-updated'
  | 'download-progress'
  | 'migrate-root-progress'
  | 'updater-status'
  | 'enrich-progress'
>

/** Channels that use webContents.send (push pattern) */
export type PushChannel =
  | 'db-updated'
  | 'download-progress'
  | 'migrate-root-progress'
  | 'updater-status'
  | 'enrich-progress'

/** Extract the result type for a given channel */
export type IpcResult<C extends keyof IpcContract> = IpcContract[C]['result']

/** Extract the parameter tuple for a given channel */
export type IpcParams<C extends keyof IpcContract> = IpcContract[C]['params']
