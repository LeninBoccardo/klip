import type { ICreatorRepository, IVideoRepository, ICutRepository } from '@domain/repositories'
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
  RootPathRef
} from '@domain/ports'
import type { IReconcileDirectory } from '@use-cases/IReconcileDirectory'
import type { IFetchVideoInfo } from '@use-cases/IFetchVideoInfo'
import type { IDownloadVideo } from '@use-cases/IDownloadVideo'
import type { IProbeMediaFile } from '@use-cases/IProbeMediaFile'
import type { IRecoverOperations } from '@use-cases/IRecoverOperations'
import type { IEnrichMediaMetadata } from '@use-cases/IEnrichMediaMetadata'
import type { IFetchChannelInfo } from '@use-cases/IFetchChannelInfo'
import type { IMigrateRootFolder } from '@use-cases/IMigrateRootFolder'
import type { IFetchVideoDetail } from '@use-cases/IFetchVideoDetail'
import type { IEnrichAllVideos } from '@use-cases/IEnrichAllVideos'
import type { IFetchVideoComments } from '@use-cases/IFetchVideoComments'
import type { IResolveMediaUrl } from '@use-cases/IResolveMediaUrl'
import type { IGetAllDistinctTags } from '@use-cases/IGetAllDistinctTags'
import type { IBulkUpdateTags } from '@use-cases/IBulkUpdateTags'
import type { IRenameTagGlobally } from '@use-cases/IRenameTagGlobally'
import type { ISearchAll } from '@use-cases/ISearchAll'
import { type DatabaseInstance, SqliteTransactionScope } from './framework-drivers/database'
import {
  SqliteCreatorRepository,
  SqliteVideoRepository,
  SqliteCutRepository,
  SqliteSettingsRepository,
  SqliteOperationRepository,
  SqliteAuditLogRepository,
  AuditedCreatorRepository,
  AuditedVideoRepository,
  AuditedCutRepository
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
import { MigrateRootFolder } from '@use-cases/MigrateRootFolder'
import { FetchVideoDetail } from '@use-cases/FetchVideoDetail'
import { EnrichAllVideos } from '@use-cases/EnrichAllVideos'
import { FetchVideoComments } from '@use-cases/FetchVideoComments'
import { ResolveMediaUrl } from '@use-cases/ResolveMediaUrl'
import { GetAllDistinctTags } from '@use-cases/GetAllDistinctTags'
import { BulkUpdateTags } from '@use-cases/BulkUpdateTags'
import { RenameTagGlobally } from '@use-cases/RenameTagGlobally'
import { SearchAll } from '@use-cases/SearchAll'

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
    migrateRootFolder: IMigrateRootFolder
    fetchVideoDetail: IFetchVideoDetail
    enrichAllVideos: IEnrichAllVideos
    fetchVideoComments: IFetchVideoComments
    resolveMediaUrl: IResolveMediaUrl
    getAllDistinctTags: IGetAllDistinctTags
    bulkUpdateTags: IBulkUpdateTags
    renameTagGlobally: IRenameTagGlobally
    searchAll: ISearchAll
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
  const idGenerator = new NodeIdGenerator()
  const updater: IUpdater = config.isDev ? new DisabledUpdater() : new ElectronAutoUpdater()
  updater.onStatusChange((status) => notifier.notify('updater-status', status))

  // ── Repositories (raw Drizzle) ──
  const sqliteCreatorRepo = new SqliteCreatorRepository(database.db)
  const sqliteVideoRepo = new SqliteVideoRepository(database.db)
  const sqliteCutRepo = new SqliteCutRepository(database.db)
  const operationRepo = new SqliteOperationRepository(database.db)
  const auditLogRepo = new SqliteAuditLogRepository(database.db)

  // ── Audited repository decorators ──
  const creatorRepo = new AuditedCreatorRepository(
    sqliteCreatorRepo,
    auditLogRepo,
    transactionScope
  )
  const videoRepo = new AuditedVideoRepository(sqliteVideoRepo, auditLogRepo, transactionScope)
  const cutRepo = new AuditedCutRepository(sqliteCutRepo, auditLogRepo, transactionScope)

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

  const downloadVideo = new DownloadVideo(
    videoDownloader,
    fetchVideoInfo,
    downloadQueue,
    creatorRepo,
    videoRepo,
    pathResolver,
    fsWriter,
    notifier,
    idGenerator,
    rootPathRef
  )

  const probeMediaFile = new ProbeMediaFile(mediaProbe)

  const recoverOperations = new RecoverOperations(operationRepo, fsReader, fsWriter, pathResolver)

  // ── File watcher ──
  const fileWatcher = new ChokidarWatcher(rootPath)
  fileWatcher.onEvent((event) => processNotifications.handleEvent(event))

  const fetchVideoDetail = new FetchVideoDetail(videoRepo, videoDownloader, fsReader, pathResolver)

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

  // ── Tag aggregation + bulk + global rename use cases ──
  // Repos here are the audited decorators, so per-entity audit log entries
  // get written automatically by upsertWithPrevious. The notifier emits a
  // single, scope-narrowed `db-updated` push at the end of each batch.
  const getAllDistinctTags = new GetAllDistinctTags(videoRepo, cutRepo)
  const bulkUpdateTags = new BulkUpdateTags(videoRepo, cutRepo, transactionScope, notifier)
  const renameTagGlobally = new RenameTagGlobally(videoRepo, cutRepo, transactionScope, notifier)

  // Search reuses the audited read methods (delegated to inner repos) and the
  // tag aggregator so the palette stays consistent with the rest of the UI.
  const searchAll = new SearchAll(creatorRepo, videoRepo, cutRepo, getAllDistinctTags)

  // ── Media protocol (entity-keyed klip-media:// resolver + handler) ──
  // The renderer references local media via klip-media://<kind>/<id>/<asset>
  // and never holds raw filesystem paths. ResolveMediaUrl maps the entity ref
  // back to a canonical path through the index; the handler enforces a
  // realpath/prefix containment check as defence-in-depth.
  const resolveMediaUrl = new ResolveMediaUrl(creatorRepo, videoRepo, cutRepo)
  const klipMediaProtocol = new KlipMediaProtocolHandler(resolveMediaUrl, rootPathRef)

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
      updater
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
      migrateRootFolder,
      fetchVideoDetail,
      enrichAllVideos,
      fetchVideoComments,
      resolveMediaUrl,
      getAllDistinctTags,
      bulkUpdateTags,
      renameTagGlobally,
      searchAll
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
      database.raw.close()
      console.log('[klip] Container shut down: watcher stopped, debouncer cancelled, DB closed')
    }
  }
}
