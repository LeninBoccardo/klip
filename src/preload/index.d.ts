import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  ReconcileResult,
  DownloadVideoResult,
  FetchChannelInfoResult,
  VideoInfo,
  DownloadProgress,
  DbUpdatedPayload,
  MigrateRootProgress,
  MigrateRootResult,
  MediaProbeResult,
  PaginationParams,
  PaginatedResult,
  VideoQueryParams,
  CutQueryParams,
  VideoDetailWithTranscript,
  TranscriptSegment,
  EnrichVideosResult,
  EnrichProgress,
  VideoCommentsResult,
  UpdaterStatus,
  TagAggregation,
  BulkUpdateTagsRequest,
  BulkUpdateTagsResult,
  RenameTagGloballyResult,
  DeleteTagGloballyResult,
  SearchAllResult,
  CreateCollectionRequest,
  RenameCollectionRequest,
  AddToCollectionRequest,
  AddToCollectionResult,
  RemoveFromCollectionRequest,
  ReorderCollectionRequest,
  RegisterCreatorRequest,
  RegisterCreatorResult,
  MoveVideosToCreatorRequest,
  MoveVideosToCreatorResult,
  SearchTranscriptsParams,
  TranscriptSearchResult,
  StorageStats,
  LibraryStats,
  RenderCutRequest,
  RenderCutResponse,
  RenderProgress,
  EditorSessionState
} from '@shared/types'
import type {
  CreatorDto,
  VideoDto,
  CutDto,
  AuditEntryDto,
  OperationDto,
  CollectionDto,
  CollectionItemDto
} from '@shared/dtos'

interface KlipAPI {
  // ── Reconciliation ──
  reconcile(): Promise<ReconcileResult>

  // ── Download & Media ──
  fetchVideoInfo(url: string): Promise<VideoInfo>
  downloadVideo(url: string, creatorName: string): Promise<DownloadVideoResult>
  cancelDownload(downloadId: string): Promise<void>
  probeMediaFile(filePath: string): Promise<MediaProbeResult>
  fetchChannelInfo(url: string): Promise<FetchChannelInfoResult>

  // ── Creators ──
  getCreatorsPaginated(params: PaginationParams): Promise<PaginatedResult<CreatorDto>>
  getCreatorById(id: string): Promise<CreatorDto | null>
  deleteCreator(id: string): Promise<void>
  restoreCreator(id: string): Promise<void>
  registerCreator(request: RegisterCreatorRequest): Promise<RegisterCreatorResult>

  // ── Videos ──
  getVideosPaginated(params: VideoQueryParams): Promise<PaginatedResult<VideoDto>>
  getVideoById(id: string): Promise<VideoDto | null>
  deleteVideo(id: string): Promise<void>
  restoreVideo(id: string): Promise<void>
  fetchVideoDetail(videoId: string): Promise<VideoDetailWithTranscript>
  enrichAllVideos(): Promise<EnrichVideosResult>
  getTranscript(videoId: string): Promise<string | null>
  getTranscriptSegments(videoId: string): Promise<TranscriptSegment[] | null>
  fetchVideoComments(videoId: string, maxComments?: number): Promise<VideoCommentsResult>
  getCachedVideoComments(videoId: string): Promise<VideoCommentsResult | null>
  moveVideosToCreator(request: MoveVideosToCreatorRequest): Promise<MoveVideosToCreatorResult>

  // ── Cuts ──
  getCutsPaginated(params: CutQueryParams): Promise<PaginatedResult<CutDto>>
  getCutById(id: string): Promise<CutDto | null>
  getCutsByTags(tags: string[]): Promise<CutDto[]>
  deleteCut(id: string): Promise<void>
  restoreCut(id: string): Promise<void>

  // ── Collections ──
  getCollectionsPaginated(params: PaginationParams): Promise<PaginatedResult<CollectionDto>>
  getCollectionById(id: string): Promise<CollectionDto | null>
  getCollectionItems(collectionId: string): Promise<CollectionItemDto[]>
  createCollection(request: CreateCollectionRequest): Promise<CollectionDto>
  renameCollection(request: RenameCollectionRequest): Promise<CollectionDto>
  deleteCollection(id: string): Promise<{ deleted: boolean }>
  addToCollection(request: AddToCollectionRequest): Promise<AddToCollectionResult>
  removeFromCollection(request: RemoveFromCollectionRequest): Promise<{ removed: boolean }>
  reorderCollection(request: ReorderCollectionRequest): Promise<{ reordered: number }>

  // ── Search ──
  searchAll(query: string, limit?: number): Promise<SearchAllResult>
  searchTranscripts(params: SearchTranscriptsParams): Promise<TranscriptSearchResult>

  // ── Shell ──
  openMediaExternally(kind: 'video' | 'cut', id: string): Promise<{ ok: boolean; error?: string }>
  openPathInShell(path: string): Promise<{ ok: boolean; error?: string }>
  openLogFolder(): Promise<{ ok: boolean; error?: string }>
  openExternalUrl(url: string): Promise<{ ok: boolean; error?: string }>
  revealEntityInFolder(kind: 'video' | 'cut', id: string): Promise<{ ok: boolean; error?: string }>
  revealCreatorFolder(creatorId: string): Promise<{ ok: boolean; error?: string }>

  // ── Stats ──
  getStorageStats(): Promise<StorageStats>
  getLibraryStats(): Promise<LibraryStats>

  // ── Tags ──
  getAllDistinctTags(): Promise<TagAggregation[]>
  bulkUpdateTags(request: BulkUpdateTagsRequest): Promise<BulkUpdateTagsResult>
  renameTagGlobally(oldTag: string, newTag: string): Promise<RenameTagGloballyResult>
  deleteTagGlobally(tag: string): Promise<DeleteTagGloballyResult>

  // ── Settings ──
  getSettings(): Promise<Record<string, string>>
  getSetting(key: string): Promise<string | null>
  setSetting(key: string, value: string): Promise<void>
  migrateRoot(newRootPath: string): Promise<MigrateRootResult>
  selectFolder(): Promise<string | null>

  // ── Audit Log ──
  getAuditLogByEntity(entityType: string, entityId: string): Promise<AuditEntryDto[]>
  getAuditLogRecent(limit: number): Promise<AuditEntryDto[]>

  // ── Operations ──
  getOperationById(id: string): Promise<OperationDto | null>
  getOperationsByStatus(status: string): Promise<OperationDto[]>

  // ── Updater ──
  checkForUpdates(): Promise<UpdaterStatus>
  installUpdate(): Promise<void>
  getUpdaterStatus(): Promise<UpdaterStatus>

  // ── Editor (in-app trim) ──
  /** Spawn or focus the dedicated editor window for the given source video. */
  editorOpenWindow(input: { sourceVideoId: string }): Promise<void>
  /** Enqueue a render. Returns immediately with a tracking jobId + the new cutId. */
  editorStartRender(request: RenderCutRequest): Promise<RenderCutResponse>
  /** Abort an in-flight render. No-op if the job already finished. */
  editorCancelRender(jobId: string): Promise<void>
  /** Read-back current session state — used by the sidebar progress chip. */
  editorGetSession(jobId: string): Promise<EditorSessionState | null>
  /**
   * Look up the active session for a source video. Used by the editor
   * window on bootstrap to rehydrate progress state after a close+reopen
   * mid-render. Returns null if no non-terminal session matches.
   */
  editorFindSessionBySource(sourceVideoId: string): Promise<EditorSessionState | null>

  // ── Push event listeners ──
  /** Subscribe to download progress events; returns an unsubscribe function */
  onDownloadProgress(callback: (event: unknown, data: DownloadProgress) => void): () => void
  /** Subscribe to db-updated events; returns an unsubscribe function */
  onDbUpdated(callback: (event: unknown, data: DbUpdatedPayload) => void): () => void
  /** Subscribe to migrate-root progress events; returns an unsubscribe function */
  onMigrateRootProgress(callback: (event: unknown, data: MigrateRootProgress) => void): () => void
  /** Subscribe to auto-updater status changes; returns an unsubscribe function */
  onUpdaterStatus(callback: (event: unknown, data: UpdaterStatus) => void): () => void
  /** Subscribe to batch-enrich progress events; returns an unsubscribe function */
  onEnrichProgress(callback: (event: unknown, data: EnrichProgress) => void): () => void
  /** Subscribe to editor render-progress events; returns an unsubscribe function */
  onRenderProgress(callback: (event: unknown, data: RenderProgress) => void): () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: KlipAPI
  }
}
