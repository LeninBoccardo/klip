import type {
  ICreatorRepository,
  IVideoRepository,
  ICutRepository,
  ICollectionRepository
} from '@domain/repositories'
import type {
  IOperationRepository,
  IAuditLogRepository,
  ISettingsRepository
} from '@domain/repositories'
import type {
  IFileWatcher,
  IDebouncer,
  IFileSystemReader,
  IFileSystemWriter,
  IPathResolver,
  ITransactionScope,
  INotifier,
  IBinaryResolver,
  IVideoDownloader,
  IMediaProbe,
  IDownloadQueue,
  IIdGenerator,
  IUpdater,
  IRenderBackend,
  IRenderQueue,
  IEditorSessionStore,
  IWindowManager,
  RootPathRef
} from '@domain/ports'
import type { IReconcileDirectory } from '@use-cases/IReconcileDirectory'
import type { IFetchVideoInfo } from '@use-cases/IFetchVideoInfo'
import type { IDownloadVideo } from '@use-cases/IDownloadVideo'
import type { IProbeMediaFile } from '@use-cases/IProbeMediaFile'
import type { IRecoverOperations } from '@use-cases/IRecoverOperations'
import type { IEnrichMediaMetadata } from '@use-cases/IEnrichMediaMetadata'
import type { IFetchChannelInfo } from '@use-cases/IFetchChannelInfo'
import type { IRegisterCreator } from '@use-cases/IRegisterCreator'
import type { IMigrateRootFolder } from '@use-cases/IMigrateRootFolder'
import type { IFetchVideoDetail } from '@use-cases/IFetchVideoDetail'
import type { IEnrichAllVideos } from '@use-cases/IEnrichAllVideos'
import type { IFetchVideoComments } from '@use-cases/IFetchVideoComments'
import type { IMoveVideosToCreator } from '@use-cases/IMoveVideosToCreator'
import type { ISearchTranscripts } from '@use-cases/ISearchTranscripts'
import type { IBackfillTranscriptIndex } from '@use-cases/IBackfillTranscriptIndex'
import type { IResolveMediaUrl } from '@use-cases/IResolveMediaUrl'
import type { IGetAllDistinctTags } from '@use-cases/IGetAllDistinctTags'
import type { IBulkUpdateTags } from '@use-cases/IBulkUpdateTags'
import type { IRenameTagGlobally } from '@use-cases/IRenameTagGlobally'
import type { IDeleteTagGlobally } from '@use-cases/IDeleteTagGlobally'
import type { ISearchAll } from '@use-cases/ISearchAll'
import type { ICreateCollection } from '@use-cases/ICreateCollection'
import type { IRenameCollection } from '@use-cases/IRenameCollection'
import type { IDeleteCollection } from '@use-cases/IDeleteCollection'
import type { IAddToCollection } from '@use-cases/IAddToCollection'
import type { IRemoveFromCollection } from '@use-cases/IRemoveFromCollection'
import type { IReorderCollection } from '@use-cases/IReorderCollection'
import type { IGetCollectionItems } from '@use-cases/IGetCollectionItems'
import type { IGetCollectionById } from '@use-cases/IGetCollectionById'
import type { IGetCollectionsPaginated } from '@use-cases/IGetCollectionsPaginated'
import { type DatabaseInstance, SqliteTransactionScope } from './framework-drivers/database'
import {
  SqliteCreatorRepository,
  SqliteVideoRepository,
  SqliteCutRepository,
  SqliteSettingsRepository,
  SqliteOperationRepository,
  SqliteAuditLogRepository,
  SqliteCollectionRepository,
  AuditedCreatorRepository,
  AuditedVideoRepository,
  AuditedCutRepository,
  AuditedCollectionRepository,
  SqliteVideoTranscriptIndex
} from './interface-adapters/repositories'
import {
  NodeFileSystemReader,
  NodeFileSystemWriter,
  NodePathResolver
} from './interface-adapters/file-system'
import { PQueueNotificationQueue, PQueueDownloadQueue } from './interface-adapters/queue'
import { NodeIdGenerator } from './interface-adapters/crypto/NodeIdGenerator'
import { NodeDebouncer } from './framework-drivers/timers'
import { ElectronNotifier } from './framework-drivers/electron/ElectronNotifier'
import { ElectronBinaryResolver } from './framework-drivers/electron/ElectronBinaryResolver'
import {
  ElectronAutoUpdater,
  DisabledUpdater
} from './framework-drivers/electron/ElectronAutoUpdater'
import { ChokidarWatcher } from './framework-drivers/file-system/ChokidarWatcher'
import { YtDlpDownloader } from './framework-drivers/yt-dlp/YtDlpDownloader'
import { FfprobeMediaProbe } from './framework-drivers/ffprobe/FfprobeMediaProbe'
import { KlipMediaProtocolHandler } from './framework-drivers/electron/KlipMediaProtocolHandler'
import { ReconcileDirectory } from '@use-cases/ReconcileDirectory'
import { ProcessFileNotifications } from '@use-cases/ProcessFileNotifications'
import { FetchVideoInfo } from '@use-cases/FetchVideoInfo'
import { DownloadVideo } from '@use-cases/DownloadVideo'
import { ProbeMediaFile } from '@use-cases/ProbeMediaFile'
import { RecoverOperations } from '@use-cases/RecoverOperations'
import { EnrichMediaMetadata } from '@use-cases/EnrichMediaMetadata'
import { FetchChannelInfo } from '@use-cases/FetchChannelInfo'
import { RegisterCreator } from '@use-cases/RegisterCreator'
import { MigrateRootFolder } from '@use-cases/MigrateRootFolder'
import { FetchVideoDetail } from '@use-cases/FetchVideoDetail'
import { MarkVideoMissing } from '@use-cases/MarkVideoMissing'
import { MarkVideoActive } from '@use-cases/MarkVideoActive'
import { EnrichAllVideos } from '@use-cases/EnrichAllVideos'
import { FetchVideoComments } from '@use-cases/FetchVideoComments'
import { ResolveMediaUrl } from '@use-cases/ResolveMediaUrl'
import { GetAllDistinctTags } from '@use-cases/GetAllDistinctTags'
import { BulkUpdateTags } from '@use-cases/BulkUpdateTags'
import { RenameTagGlobally } from '@use-cases/RenameTagGlobally'
import { DeleteTagGlobally } from '@use-cases/DeleteTagGlobally'
import { MoveVideosToCreator } from '@use-cases/MoveVideosToCreator'
import { SearchTranscripts } from '@use-cases/SearchTranscripts'
import { BackfillTranscriptIndex } from '@use-cases/BackfillTranscriptIndex'
import { SearchAll } from '@use-cases/SearchAll'
import { CreateCollection } from '@use-cases/CreateCollection'
import { RenameCollection } from '@use-cases/RenameCollection'
import { DeleteCollection } from '@use-cases/DeleteCollection'
import { AddToCollection } from '@use-cases/AddToCollection'
import { RemoveFromCollection } from '@use-cases/RemoveFromCollection'
import { ReorderCollection } from '@use-cases/ReorderCollection'
import { GetCollectionItems } from '@use-cases/GetCollectionItems'
import { GetCollectionById } from '@use-cases/GetCollectionById'
import { GetCollectionsPaginated } from '@use-cases/GetCollectionsPaginated'
import { GetStorageStats } from '@use-cases/GetStorageStats'
import type { IGetStorageStats } from '@use-cases/IGetStorageStats'
import { GetLibraryStats } from '@use-cases/GetLibraryStats'
import type { IGetLibraryStats } from '@use-cases/IGetLibraryStats'
import { RenderCutFromVideo } from '@use-cases/RenderCutFromVideo'
import type { IRenderCutFromVideo } from '@use-cases/IRenderCutFromVideo'
import { CancelRender } from '@use-cases/CancelRender'
import type { ICancelRender } from '@use-cases/ICancelRender'
import { FfmpegRenderBackend } from './framework-drivers/ffmpeg/FfmpegRenderBackend'
import { PQueueRenderQueue } from './interface-adapters/queue/PQueueRenderQueue'
import { InMemoryEditorSessionStore } from './interface-adapters/editor/InMemoryEditorSessionStore'
import { createElectronWindowManager } from './framework-drivers/electron/WindowManager'

/**
 * Application dependency container.
 * All concrete instances are wired here — the rest of the app depends only on interfaces.
 */
export interface AppContainer {
  database: DatabaseInstance
  repositories: {
    creator: ICreatorRepository
    video: IVideoRepository
    cut: ICutRepository
    collection: ICollectionRepository
    settings: ISettingsRepository
    operation: IOperationRepository
    auditLog: IAuditLogRepository
  }
  ports: {
    fsReader: IFileSystemReader
    fsWriter: IFileSystemWriter
    pathResolver: IPathResolver
    transactionScope: ITransactionScope
    notifier: INotifier
    debouncer: IDebouncer
    binaryResolver: IBinaryResolver
    videoDownloader: IVideoDownloader
    mediaProbe: IMediaProbe
    downloadQueue: IDownloadQueue
    idGenerator: IIdGenerator
    updater: IUpdater
    renderBackends: IRenderBackend[]
    renderQueue: IRenderQueue
    editorSessions: IEditorSessionStore
    windowManager: IWindowManager
  }
  useCases: {
    reconcile: IReconcileDirectory
    processNotifications: ProcessFileNotifications
    fetchVideoInfo: IFetchVideoInfo
    downloadVideo: IDownloadVideo
    probeMediaFile: IProbeMediaFile
    recoverOperations: IRecoverOperations
    enrichMedia: IEnrichMediaMetadata
    fetchChannelInfo: IFetchChannelInfo
    registerCreator: IRegisterCreator
    migrateRootFolder: IMigrateRootFolder
    fetchVideoDetail: IFetchVideoDetail
    enrichAllVideos: IEnrichAllVideos
    fetchVideoComments: IFetchVideoComments
    moveVideosToCreator: IMoveVideosToCreator
    searchTranscripts: ISearchTranscripts
    backfillTranscriptIndex: IBackfillTranscriptIndex
    resolveMediaUrl: IResolveMediaUrl
    getAllDistinctTags: IGetAllDistinctTags
    bulkUpdateTags: IBulkUpdateTags
    renameTagGlobally: IRenameTagGlobally
    deleteTagGlobally: IDeleteTagGlobally
    searchAll: ISearchAll
    createCollection: ICreateCollection
    renameCollection: IRenameCollection
    deleteCollection: IDeleteCollection
    addToCollection: IAddToCollection
    removeFromCollection: IRemoveFromCollection
    reorderCollection: IReorderCollection
    getCollectionItems: IGetCollectionItems
    getCollectionById: IGetCollectionById
    getCollectionsPaginated: IGetCollectionsPaginated
    getStorageStats: IGetStorageStats
    getLibraryStats: IGetLibraryStats
    renderCutFromVideo: IRenderCutFromVideo
    cancelRender: ICancelRender
  }
  services: {
    fileWatcher: IFileWatcher
    klipMediaProtocol: KlipMediaProtocolHandler
  }
  rootPathRef: RootPathRef
  /** Stop watcher, cancel timers, close DB */
  shutdown(): void
}

export interface AppConfig {
  database: DatabaseInstance
  /**
   * Fallback root path used only when the settings table has no `rootPath` stored
   * (first launch). The container resolves the effective root from settings.
   */
  defaultRootPath: string
  /** When true, the auto-updater is replaced with a no-op `DisabledUpdater`. */
  isDev: boolean
  /** Path to the icon used for non-titlebar window decorations on Linux. */
  iconPath: string
}

/**
 * Wire all dependencies and return the application container.
 * Call `container.shutdown()` on app quit.
 */
export function createAppContainer(config: AppConfig): AppContainer {
  // ── Framework drivers ──
  const database = config.database

  // ── Settings repository + root-path resolution ──
  // Settings is constructed first so the container can resolve `rootPath`
  // from persisted state before any other dependency (watcher, downloader,
  // rootPathRef) is instantiated. On first launch, the default is persisted.
  const settingsRepo = new SqliteSettingsRepository(database.db)
  const storedRootPath = settingsRepo.get('rootPath')
  const rootPath = storedRootPath ?? config.defaultRootPath
  if (!storedRootPath) {
    settingsRepo.set('rootPath', rootPath)
  }
  const rootPathRef: RootPathRef = { value: rootPath }

  // ── Ports / adapters ──
  const fsReader = new NodeFileSystemReader()
  const fsWriter = new NodeFileSystemWriter()
  const pathResolver = new NodePathResolver()
  const transactionScope = new SqliteTransactionScope(database.raw)
  const notifier = new ElectronNotifier()
  const debouncer = new NodeDebouncer()
  const binaryResolver = new ElectronBinaryResolver()
  const videoDownloader = new YtDlpDownloader(binaryResolver)
  const mediaProbe = new FfprobeMediaProbe(binaryResolver)
  const downloadQueue = new PQueueDownloadQueue(2)
  const renderQueue = new PQueueRenderQueue(1)
  const editorSessions = new InMemoryEditorSessionStore()
  // The list-of-backends pattern lets v2 add SmartCutRenderBackend or a
  // WebCodecsRenderBackend without touching `RenderCutFromVideo`. MVP
  // ships only the ffmpeg backend, but the use-case picks via
  // `canRender()` so the multi-backend selection is exercised from day one.
  const ffmpegRenderBackend = new FfmpegRenderBackend(binaryResolver)
  const renderBackends: IRenderBackend[] = [ffmpegRenderBackend]
  const windowManager = createElectronWindowManager({
    iconPath: config.iconPath,
    isDev: config.isDev
  })
  const idGenerator = new NodeIdGenerator()
  const updater: IUpdater = config.isDev ? new DisabledUpdater() : new ElectronAutoUpdater()
  updater.onStatusChange((status) => notifier.notify('updater-status', status))

  // ── Repositories (raw Drizzle) ──
  const sqliteCreatorRepo = new SqliteCreatorRepository(database.db)
  const sqliteVideoRepo = new SqliteVideoRepository(database.db)
  const sqliteCutRepo = new SqliteCutRepository(database.db)
  const sqliteCollectionRepo = new SqliteCollectionRepository(database.db)
  const operationRepo = new SqliteOperationRepository(database.db)
  const auditLogRepo = new SqliteAuditLogRepository(database.db)

  // ── Audited repository decorators ──
  // Video and cut audited repos must be built first because the audited
  // creator repo needs them for cascade-delete audit enumeration.
  const videoRepo = new AuditedVideoRepository(sqliteVideoRepo, auditLogRepo, transactionScope)
  const cutRepo = new AuditedCutRepository(sqliteCutRepo, auditLogRepo, transactionScope)
  const creatorRepo = new AuditedCreatorRepository(
    sqliteCreatorRepo,
    auditLogRepo,
    transactionScope,
    videoRepo,
    cutRepo
  )
  const collectionRepo = new AuditedCollectionRepository(
    sqliteCollectionRepo,
    auditLogRepo,
    transactionScope
  )

  // ── Use cases ──
  const reconcile = new ReconcileDirectory(
    creatorRepo,
    videoRepo,
    cutRepo,
    fsReader,
    pathResolver,
    transactionScope
  )

  const enrichMedia = new EnrichMediaMetadata(videoRepo, cutRepo, mediaProbe, notifier)

  const notificationQueue = new PQueueNotificationQueue()
  const processNotifications = new ProcessFileNotifications(
    notificationQueue,
    debouncer,
    reconcile,
    notifier,
    rootPathRef,
    undefined, // use default FlushConfig
    enrichMedia
  )

  const fetchVideoInfo = new FetchVideoInfo(videoDownloader)
  const fetchChannelInfo = new FetchChannelInfo(videoDownloader, creatorRepo)
  const registerCreator = new RegisterCreator(
    creatorRepo,
    idGenerator,
    fsWriter,
    pathResolver,
    rootPathRef,
    transactionScope
  )

  const downloadVideo = new DownloadVideo(
    videoDownloader,
    fetchVideoInfo,
    downloadQueue,
    creatorRepo,
    videoRepo,
    pathResolver,
    fsReader,
    fsWriter,
    notifier,
    idGenerator,
    rootPathRef
  )

  const probeMediaFile = new ProbeMediaFile(mediaProbe)

  const recoverOperations = new RecoverOperations(
    operationRepo,
    fsReader,
    fsWriter,
    pathResolver,
    cutRepo
  )

  // ── File watcher ──
  const fileWatcher = new ChokidarWatcher(rootPath)
  fileWatcher.onEvent((event) => processNotifications.handleEvent(event))

  // Dead-link handling: FetchVideoDetail flips a video to `'missing'` on
  // YouTube 404/403 (via markMissing), and back to `'active'` on a
  // successful refresh of a previously-missing video (via markActive).
  const markVideoMissing = new MarkVideoMissing(videoRepo, notifier)
  const markVideoActive = new MarkVideoActive(videoRepo, notifier)
  const fetchVideoDetail = new FetchVideoDetail(
    videoRepo,
    videoDownloader,
    fsReader,
    pathResolver,
    markVideoMissing,
    markVideoActive
  )

  // Dedicated queue (concurrency 1) keeps batch enrichment from competing with
  // user-triggered downloads for slots in the shared download queue and bounds
  // YouTube rate-limit pressure regardless of user activity.
  const enrichmentQueue = new PQueueDownloadQueue(1)
  const enrichAllVideos = new EnrichAllVideos(
    videoRepo,
    fetchVideoDetail,
    enrichmentQueue,
    notifier
  )

  const fetchVideoComments = new FetchVideoComments(videoRepo, videoDownloader)
  const moveVideosToCreator = new MoveVideosToCreator(
    videoRepo,
    creatorRepo,
    fsReader,
    fsWriter,
    pathResolver,
    notifier,
    rootPathRef
  )

  // ── Transcript FTS5 search + backfill ──
  // The index talks to the raw better-sqlite3 handle since virtual tables
  // aren't modelled by Drizzle. Backfill runs once at boot to seed the FTS
  // table for any videos that pre-existed migration 0009.
  const transcriptIndex = new SqliteVideoTranscriptIndex(database.raw)
  const searchTranscripts = new SearchTranscripts(transcriptIndex)
  const backfillTranscriptIndex = new BackfillTranscriptIndex(transcriptIndex, fsReader)

  // ── Tag aggregation + bulk + global rename use cases ──
  // Repos here are the audited decorators, so per-entity audit log entries
  // get written automatically by upsertWithPrevious. The notifier emits a
  // single, scope-narrowed `db-updated` push at the end of each batch.
  const getAllDistinctTags = new GetAllDistinctTags(videoRepo, cutRepo)
  const bulkUpdateTags = new BulkUpdateTags(videoRepo, cutRepo, transactionScope, notifier)
  const renameTagGlobally = new RenameTagGlobally(videoRepo, cutRepo, transactionScope, notifier)
  const deleteTagGlobally = new DeleteTagGlobally(videoRepo, cutRepo, transactionScope, notifier)

  // Search reuses the audited read methods (delegated to inner repos) and the
  // tag aggregator so the palette stays consistent with the rest of the UI.
  const searchAll = new SearchAll(creatorRepo, videoRepo, cutRepo, getAllDistinctTags)

  // ── Collections / playlists use cases ──
  // Each mutation use case fires a `db-updated` push with `scope: ['collections']`
  // so the renderer's targeted query invalidation refreshes only the collections
  // tree. AddToCollection / ReorderCollection wrap their multi-step writes in
  // `transactionScope.run()` to maintain the unified-position invariant.
  const createCollection = new CreateCollection(collectionRepo, idGenerator, notifier)
  const renameCollection = new RenameCollection(collectionRepo, notifier)
  const deleteCollection = new DeleteCollection(collectionRepo, notifier)
  const addToCollection = new AddToCollection(
    collectionRepo,
    videoRepo,
    cutRepo,
    transactionScope,
    notifier
  )
  const removeFromCollection = new RemoveFromCollection(collectionRepo, notifier)
  const reorderCollection = new ReorderCollection(collectionRepo, transactionScope, notifier)
  const getCollectionItems = new GetCollectionItems(collectionRepo, videoRepo, cutRepo)
  const getCollectionById = new GetCollectionById(collectionRepo)
  const getCollectionsPaginated = new GetCollectionsPaginated(collectionRepo)

  // ── Stats / dashboard ──
  // Both pure aggregate readers — no audit footprint, no notifier traffic.
  const getStorageStats = new GetStorageStats(videoRepo, cutRepo)
  const getLibraryStats = new GetLibraryStats(creatorRepo, videoRepo, cutRepo, getStorageStats)

  // ── Media protocol (entity-keyed klip-media:// resolver + handler) ──
  // The renderer references local media via klip-media://<kind>/<id>/<asset>
  // and never holds raw filesystem paths. ResolveMediaUrl maps the entity ref
  // back to a canonical path through the index; the handler enforces a
  // realpath/prefix containment check as defence-in-depth.
  const resolveMediaUrl = new ResolveMediaUrl(creatorRepo, videoRepo, cutRepo)
  const klipMediaProtocol = new KlipMediaProtocolHandler(resolveMediaUrl, rootPathRef)

  // ── Editor (in-app trim) ──
  // The use case picks among `renderBackends` per recipe via canRender();
  // MVP only has the ffmpeg backend, but the multi-backend selection is
  // exercised from day one so adding SmartCut / WebCodecs in v2 is purely
  // additive. The render queue is concurrency 1 — a parallel render
  // would just thrash the disk on the same source file.
  const renderCutFromVideo = new RenderCutFromVideo(
    renderBackends,
    renderQueue,
    editorSessions,
    cutRepo,
    creatorRepo,
    videoRepo,
    operationRepo,
    fsReader,
    fsWriter,
    pathResolver,
    idGenerator,
    notifier,
    rootPathRef
  )
  const cancelRender = new CancelRender(editorSessions)

  const migrateRootFolder = new MigrateRootFolder(
    operationRepo,
    settingsRepo,
    videoRepo,
    cutRepo,
    fsReader,
    fsWriter,
    pathResolver,
    fileWatcher,
    processNotifications,
    reconcile,
    idGenerator,
    notifier,
    rootPathRef,
    transactionScope
  )

  return {
    database,
    repositories: {
      creator: creatorRepo,
      video: videoRepo,
      cut: cutRepo,
      collection: collectionRepo,
      settings: settingsRepo,
      operation: operationRepo,
      auditLog: auditLogRepo
    },
    ports: {
      fsReader,
      fsWriter,
      pathResolver,
      transactionScope,
      notifier,
      debouncer,
      binaryResolver,
      videoDownloader,
      mediaProbe,
      downloadQueue,
      idGenerator,
      updater,
      renderBackends,
      renderQueue,
      editorSessions,
      windowManager
    },
    useCases: {
      reconcile,
      processNotifications,
      fetchVideoInfo,
      downloadVideo,
      probeMediaFile,
      recoverOperations,
      enrichMedia,
      fetchChannelInfo,
      registerCreator,
      migrateRootFolder,
      fetchVideoDetail,
      enrichAllVideos,
      fetchVideoComments,
      moveVideosToCreator,
      searchTranscripts,
      backfillTranscriptIndex,
      resolveMediaUrl,
      getAllDistinctTags,
      bulkUpdateTags,
      renameTagGlobally,
      deleteTagGlobally,
      searchAll,
      createCollection,
      renameCollection,
      deleteCollection,
      addToCollection,
      removeFromCollection,
      reorderCollection,
      getCollectionItems,
      getCollectionById,
      getCollectionsPaginated,
      getStorageStats,
      getLibraryStats,
      renderCutFromVideo,
      cancelRender
    },
    services: {
      fileWatcher,
      klipMediaProtocol
    },
    rootPathRef,
    shutdown(): void {
      // Process is exiting; the OS will reclaim the chokidar file handles
      // synchronously even if close() hasn't fully resolved. Don't block quit.
      void fileWatcher.stop()
      debouncer.cancel()
      downloadQueue.clear()
      // Drop any pending render tasks and SIGTERM in-flight ffmpeg children
      // so the staging files are finalised cleanly before the OS reaps the
      // process. The recovery sweep on next launch picks up anything that
      // didn't finish writing.
      renderQueue.clear()
      for (const session of editorSessions.list()) {
        const controller = editorSessions.getAbortController(session.jobId)
        if (controller && !controller.signal.aborted) controller.abort()
      }
      // Force a WAL checkpoint before close so the next launch doesn't see
      // leftover *-wal / *-shm files. RESTART blocks new readers/writers
      // during the checkpoint, which is fine here since we're exiting.
      try {
        database.raw.pragma('wal_checkpoint(RESTART)')
      } catch (err) {
        console.warn('[klip] WAL checkpoint failed during shutdown:', err)
      }
      database.raw.close()
      console.log('[klip] Container shut down: watcher stopped, debouncer cancelled, DB closed')
    }
  }
}
