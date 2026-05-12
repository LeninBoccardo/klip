import { app, protocol } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { createAppContainer, type AppContainer } from './composition-root'
import { redactPath, redactError } from './domain/types/redact'
import { registerReconcileController } from './interface-adapters/controllers/ReconcileController'
import { registerDownloadController } from './interface-adapters/controllers/DownloadController'
import { registerCreatorController } from './interface-adapters/controllers/CreatorController'
import { registerVideoController } from './interface-adapters/controllers/VideoController'
import { registerCutController } from './interface-adapters/controllers/CutController'
import { registerTagController } from './interface-adapters/controllers/TagController'
import { registerSearchController } from './interface-adapters/controllers/SearchController'
import { registerShellController } from './interface-adapters/controllers/ShellController'
import { registerCollectionController } from './interface-adapters/controllers/CollectionController'
import { registerSettingsController } from './interface-adapters/controllers/SettingsController'
import { registerAuditLogController } from './interface-adapters/controllers/AuditLogController'
import { registerOperationController } from './interface-adapters/controllers/OperationController'
import { registerUpdaterController } from './interface-adapters/controllers/UpdaterController'
import { registerStatsController } from './interface-adapters/controllers/StatsController'
import { registerEditorController } from './interface-adapters/controllers/EditorController'
import { initLogger } from './framework-drivers/electron/logger'
import { applySecurityHardening } from './framework-drivers/electron/security-hardening'
import { join } from 'path'
import { initializeDatabase } from './framework-drivers/database'

// ── Register custom protocol for serving local media files ──
protocol.registerSchemesAsPrivileged([
  { scheme: 'klip-media', privileges: { standard: false, secure: true, supportFetchAPI: true } }
])

// ── Initialise persistent logger before app.whenReady so even boot-time
//    crashes leave a trail. Dev runs land at <cwd>/logs/klip-dev.log so
//    the file is readable from the project root during manual testing;
//    packaged runs use <userData>/logs/klip.log as before.
initLogger(app, { isDev: is.dev })

// ── Test-only overrides ──
// E2E tests need to point the user-data path at a temp directory so they
// never touch the developer's real DB. `app.setPath` must run before
// `app.whenReady`, so this block lives at the top of the module. Both
// vars are no-ops when unset.
if (process.env.KLIP_USER_DATA) {
  app.setPath('userData', process.env.KLIP_USER_DATA)
}

// ── Application container (initialised in app.whenReady) ──
let container: AppContainer

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // ── Defence-in-depth security: deny external navigation + lock permissions.
  //    Wired here (not at module load) because `session.defaultSession` throws
  //    if accessed before app-ready. The global `web-contents-created` listener
  //    is still registered before `createWindow()` below, so the first window's
  //    contents are caught.
  applySecurityHardening()

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // ── Create DI container ──
  // KLIP_DEFAULT_ROOT lets E2E tests override the default rootPath so
  // each test starts with an empty creator folder; ignored in normal use.
  const defaultRootPath = process.env.KLIP_DEFAULT_ROOT ?? join(app.getPath('documents'), 'klip')
  const dbPath = join(app.getPath('userData'), 'klip.db')

  // Open DB and create the container — root-path resolution (read settings,
  // persist default on first launch) lives inside the container so concrete
  // repository instantiation stays out of the bootstrap.
  const database = initializeDatabase(dbPath)
  container = createAppContainer({ database, defaultRootPath, isDev: is.dev, iconPath: icon })
  const rootPath = container.rootPathRef.value
  console.log(
    `[klip] Container initialised (db: ${redactPath(dbPath, rootPath)}, root: ${redactPath(rootPath, rootPath)})`
  )

  // ── Custom protocol: klip-media:// serves local media via entity-keyed URLs ──
  // The renderer references local files as `klip-media://<kind>/<id>/<asset>` and
  // never holds raw filesystem paths. The handler resolves the entity reference
  // through the index, then realpath/prefix-bounds the result against the active
  // rootPathRef as defence-in-depth.
  container.services.klipMediaProtocol.register()

  // ── Register IPC controllers ──
  registerReconcileController(container.useCases.reconcile, container.rootPathRef)
  registerDownloadController(
    container.useCases.fetchVideoInfo,
    container.useCases.downloadVideo,
    container.useCases.probeMediaFile,
    container.useCases.fetchChannelInfo
  )
  registerCreatorController(container.repositories.creator, container.useCases.registerCreator)
  registerVideoController(
    container.repositories.video,
    container.useCases.fetchVideoDetail,
    container.useCases.enrichAllVideos,
    container.useCases.fetchVideoComments,
    container.useCases.getCachedVideoComments,
    container.ports.fsReader,
    container.useCases.moveVideosToCreator
  )
  registerCutController(container.repositories.cut)
  registerTagController(
    container.useCases.getAllDistinctTags,
    container.useCases.bulkUpdateTags,
    container.useCases.renameTagGlobally,
    container.useCases.deleteTagGlobally
  )
  registerSearchController(container.useCases.searchAll, container.useCases.searchTranscripts)
  registerShellController(
    container.useCases.resolveMediaUrl,
    container.rootPathRef,
    container.repositories.creator
  )
  registerStatsController(container.useCases.getStorageStats, container.useCases.getLibraryStats)
  registerEditorController({
    windowManager: container.ports.windowManager,
    renderCut: container.useCases.renderCutFromVideo,
    cancelRender: container.useCases.cancelRender,
    sessions: container.ports.editorSessions
  })
  registerCollectionController({
    create: container.useCases.createCollection,
    rename: container.useCases.renameCollection,
    delete: container.useCases.deleteCollection,
    addItem: container.useCases.addToCollection,
    removeItem: container.useCases.removeFromCollection,
    reorder: container.useCases.reorderCollection,
    getItems: container.useCases.getCollectionItems,
    getById: container.useCases.getCollectionById,
    getPaginated: container.useCases.getCollectionsPaginated
  })
  registerSettingsController(container.repositories.settings, container.useCases.migrateRootFolder)
  registerAuditLogController(container.repositories.auditLog)
  registerOperationController(container.repositories.operation)
  registerUpdaterController(container.ports.updater)
  console.log(`[klip] IPC controllers registered`)

  // ── Recover stale operations from previous crash ──
  try {
    const recoverResult = container.useCases.recoverOperations.execute()
    if (recoverResult.total > 0) {
      console.log(`[klip] Operation recovery complete:`, recoverResult)
    }
  } catch (error) {
    console.error(`[klip] Operation recovery failed:`, redactError(error, rootPath))
  }

  // ── Initial reconciliation (one-time full scan at startup) ──
  try {
    const result = container.useCases.reconcile.execute(rootPath)
    console.log(`[klip] Initial reconciliation complete:`, result)
  } catch (error) {
    console.error(`[klip] Initial reconciliation failed:`, redactError(error, rootPath))
  }

  // ── Enrich media metadata for newly discovered entities (async, non-blocking) ──
  container.useCases.enrichMedia
    .execute()
    .then((enrichResult) => {
      if (enrichResult.videosProbed > 0 || enrichResult.cutsProbed > 0) {
        console.log(`[klip] Media enrichment complete:`, enrichResult)
      }
    })
    .catch((error) =>
      console.error(`[klip] Media enrichment failed:`, redactError(error, rootPath))
    )

  // ── Backfill transcript FTS index (async, non-blocking) ──
  // Idempotent — only touches videos that have a transcript_path but no
  // transcript_text yet (i.e. rows that pre-existed migration 0009).
  container.useCases.backfillTranscriptIndex
    .execute()
    .then((bf) => {
      if (bf.indexed > 0 || bf.failed > 0 || bf.missing > 0) {
        console.log(`[klip] Transcript FTS backfill complete:`, bf)
      }
    })
    .catch((error) =>
      console.error(`[klip] Transcript FTS backfill failed:`, redactError(error, rootPath))
    )

  // ── Start file watcher (runtime changes only, ignoreInitial: true) ──
  container.services.fileWatcher.start()

  container.ports.windowManager.createMainWindow()

  // ── Auto-check for updates (production only; DisabledUpdater is a no-op in dev) ──
  if (!is.dev) {
    container.ports.updater.checkForUpdates().catch((err) => {
      console.error(`[klip] Initial update check failed:`, redactError(err, rootPath))
    })
  }

  app.on('activate', function () {
    // On macOS, recreate the main window when the dock icon is clicked
    // and there are no other windows open. The WindowManager guards
    // against double-creation if a window is already alive.
    container.ports.windowManager.recreateMainWindowIfClosed()
  })
})

// Graceful shutdown
app.on('before-quit', () => {
  container?.shutdown()
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
