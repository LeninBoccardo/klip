import type BetterSqlite3 from 'better-sqlite3'
import type { ICreatorRepository, IVideoRepository, ICutRepository } from '@domain/repositories'
import type {
  IFileWatcher,
  IDebouncer,
  IFileSystemReader,
  IPathResolver,
  ITransactionScope,
  INotifier
} from '@domain/ports'
import type { IReconcileDirectory } from '@use-cases/IReconcileDirectory'
import { initializeDatabase, SqliteTransactionScope } from './framework-drivers/database'
import {
  SqliteCreatorRepository,
  SqliteVideoRepository,
  SqliteCutRepository
} from './interface-adapters/repositories'
import { NodeFileSystemReader, NodePathResolver } from './interface-adapters/file-system'
import { PQueueNotificationQueue } from './interface-adapters/queue'
import { NodeDebouncer } from './framework-drivers/timers'
import { ElectronNotifier } from './framework-drivers/electron/ElectronNotifier'
import { ChokidarWatcher } from './framework-drivers/file-system/ChokidarWatcher'
import { ReconcileDirectory } from '@use-cases/ReconcileDirectory'
import { ProcessFileNotifications } from '@use-cases/ProcessFileNotifications'

/**
 * Application dependency container.
 * All concrete instances are wired here — the rest of the app depends only on interfaces.
 */
export interface AppContainer {
  db: BetterSqlite3.Database
  repositories: {
    creator: ICreatorRepository
    video: IVideoRepository
    cut: ICutRepository
  }
  ports: {
    fsReader: IFileSystemReader
    pathResolver: IPathResolver
    transactionScope: ITransactionScope
    notifier: INotifier
    debouncer: IDebouncer
  }
  useCases: {
    reconcile: IReconcileDirectory
    processNotifications: ProcessFileNotifications
  }
  services: {
    fileWatcher: IFileWatcher
  }
  /** Stop watcher, cancel timers, close DB */
  shutdown(): void
}

export interface AppConfig {
  dbPath: string
  rootPath: string
}

/**
 * Wire all dependencies and return the application container.
 * Call `container.shutdown()` on app quit.
 */
export function createAppContainer(config: AppConfig): AppContainer {
  // ── Framework drivers ──
  const db = initializeDatabase(config.dbPath)

  // ── Ports / adapters ──
  const fsReader = new NodeFileSystemReader()
  const pathResolver = new NodePathResolver()
  const transactionScope = new SqliteTransactionScope(db)
  const notifier = new ElectronNotifier()
  const debouncer = new NodeDebouncer()

  // ── Repositories ──
  const creatorRepo = new SqliteCreatorRepository(db)
  const videoRepo = new SqliteVideoRepository(db)
  const cutRepo = new SqliteCutRepository(db)

  // ── Use cases ──
  const reconcile = new ReconcileDirectory(
    creatorRepo,
    videoRepo,
    cutRepo,
    fsReader,
    pathResolver,
    transactionScope
  )

  const notificationQueue = new PQueueNotificationQueue()
  const processNotifications = new ProcessFileNotifications(
    notificationQueue,
    debouncer,
    reconcile,
    notifier,
    config.rootPath
  )

  // ── File watcher ──
  const fileWatcher = new ChokidarWatcher(config.rootPath)
  fileWatcher.onEvent((event) => processNotifications.handleEvent(event))

  return {
    db,
    repositories: {
      creator: creatorRepo,
      video: videoRepo,
      cut: cutRepo
    },
    ports: {
      fsReader,
      pathResolver,
      transactionScope,
      notifier,
      debouncer
    },
    useCases: {
      reconcile,
      processNotifications
    },
    services: {
      fileWatcher
    },
    shutdown(): void {
      fileWatcher.stop()
      debouncer.cancel()
      db.close()
      console.log('[klip] Container shut down: watcher stopped, debouncer cancelled, DB closed')
    }
  }
}
