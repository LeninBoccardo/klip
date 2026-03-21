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
  IIdGenerator
} from '@domain/ports'
import type { IReconcileDirectory } from '@use-cases/IReconcileDirectory'
import type { IFetchVideoInfo } from '@use-cases/IFetchVideoInfo'
import type { IDownloadVideo } from '@use-cases/IDownloadVideo'
import type { IProbeMediaFile } from '@use-cases/IProbeMediaFile'
import type { IRecoverOperations } from '@use-cases/IRecoverOperations'
import type { IEnrichMediaMetadata } from '@use-cases/IEnrichMediaMetadata'
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
import { ChokidarWatcher } from './framework-drivers/file-system/ChokidarWatcher'
import { YtDlpDownloader } from './framework-drivers/yt-dlp/YtDlpDownloader'
import { FfprobeMediaProbe } from './framework-drivers/ffprobe/FfprobeMediaProbe'
import { ReconcileDirectory } from '@use-cases/ReconcileDirectory'
import { ProcessFileNotifications } from '@use-cases/ProcessFileNotifications'
import { FetchVideoInfo } from '@use-cases/FetchVideoInfo'
import { DownloadVideo } from '@use-cases/DownloadVideo'
import { ProbeMediaFile } from '@use-cases/ProbeMediaFile'
import { RecoverOperations } from '@use-cases/RecoverOperations'
import { EnrichMediaMetadata } from '@use-cases/EnrichMediaMetadata'

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
  }
  useCases: {
    reconcile: IReconcileDirectory
    processNotifications: ProcessFileNotifications
    fetchVideoInfo: IFetchVideoInfo
    downloadVideo: IDownloadVideo
    probeMediaFile: IProbeMediaFile
    recoverOperations: IRecoverOperations
    enrichMedia: IEnrichMediaMetadata
  }
  services: {
    fileWatcher: IFileWatcher
  }
  /** Stop watcher, cancel timers, close DB */
  shutdown(): void
}

export interface AppConfig {
  database: DatabaseInstance
  rootPath: string
}

/**
 * Wire all dependencies and return the application container.
 * Call `container.shutdown()` on app quit.
 */
export function createAppContainer(config: AppConfig): AppContainer {
  // ── Framework drivers ──
  const database = config.database

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

  // ── Repositories (raw Drizzle) ──
  const sqliteCreatorRepo = new SqliteCreatorRepository(database.db)
  const sqliteVideoRepo = new SqliteVideoRepository(database.db)
  const sqliteCutRepo = new SqliteCutRepository(database.db)
  const settingsRepo = new SqliteSettingsRepository(database.db)
  const operationRepo = new SqliteOperationRepository(database.db)
  const auditLogRepo = new SqliteAuditLogRepository(database.db)

  // ── Audited repository decorators ──
  const creatorRepo = new AuditedCreatorRepository(sqliteCreatorRepo, auditLogRepo)
  const videoRepo = new AuditedVideoRepository(sqliteVideoRepo, auditLogRepo)
  const cutRepo = new AuditedCutRepository(sqliteCutRepo, auditLogRepo)

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
    config.rootPath,
    undefined, // use default FlushConfig
    enrichMedia
  )

  const fetchVideoInfo = new FetchVideoInfo(videoDownloader)

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
    config.rootPath
  )

  const probeMediaFile = new ProbeMediaFile(mediaProbe)

  const recoverOperations = new RecoverOperations(operationRepo, fsReader)

  // ── File watcher ──
  const fileWatcher = new ChokidarWatcher(config.rootPath)
  fileWatcher.onEvent((event) => processNotifications.handleEvent(event))

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
      idGenerator
    },
    useCases: {
      reconcile,
      processNotifications,
      fetchVideoInfo,
      downloadVideo,
      probeMediaFile,
      recoverOperations,
      enrichMedia
    },
    services: {
      fileWatcher
    },
    shutdown(): void {
      fileWatcher.stop()
      debouncer.cancel()
      downloadQueue.clear()
      database.raw.close()
      console.log('[klip] Container shut down: watcher stopped, debouncer cancelled, DB closed')
    }
  }
}
