import { app, shell, BrowserWindow, ipcMain, protocol, net } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { pathToFileURL } from 'url'
import icon from '../../resources/icon.png?asset'
import { createAppContainer, type AppContainer } from './composition-root'
import { registerReconcileController } from './interface-adapters/controllers/ReconcileController'
import { registerDownloadController } from './interface-adapters/controllers/DownloadController'
import { registerCreatorController } from './interface-adapters/controllers/CreatorController'
import { registerVideoController } from './interface-adapters/controllers/VideoController'
import { registerCutController } from './interface-adapters/controllers/CutController'
import { registerSettingsController } from './interface-adapters/controllers/SettingsController'
import { registerAuditLogController } from './interface-adapters/controllers/AuditLogController'
import { registerOperationController } from './interface-adapters/controllers/OperationController'
import { registerUpdaterController } from './interface-adapters/controllers/UpdaterController'
import { join } from 'path'
import { initializeDatabase } from './framework-drivers/database'
import { SqliteSettingsRepository } from './interface-adapters/repositories'

// ── Register custom protocol for serving local media files ──
protocol.registerSchemesAsPrivileged([
  { scheme: 'klip-media', privileges: { standard: false, secure: true, supportFetchAPI: true } }
])

// ── Application container (initialised in app.whenReady) ──
let container: AppContainer

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 936,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local HTML file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // ── Custom protocol: klip-media:// serves local files for thumbnails ──
  protocol.handle('klip-media', (request) => {
    const filePath = decodeURIComponent(request.url.replace('klip-media://', ''))
    return net.fetch(pathToFileURL(filePath).href)
  })

  // ── Create DI container ──
  const defaultRootPath = join(app.getPath('documents'), 'klip')
  const dbPath = join(app.getPath('userData'), 'klip.db')

  // Phase 1: Open DB and resolve rootPath from settings
  const database = initializeDatabase(dbPath)
  const settingsRepo = new SqliteSettingsRepository(database.db)
  const storedRootPath = settingsRepo.get('rootPath')
  const rootPath = storedRootPath ?? defaultRootPath
  if (!storedRootPath) {
    settingsRepo.set('rootPath', rootPath)
  }

  // Phase 2: Create container with resolved rootPath and pre-opened DB
  container = createAppContainer({ database, rootPath, isDev: is.dev })
  console.log(`[klip] Container initialised (db: ${dbPath}, root: ${rootPath})`)

  // ── Register IPC controllers ──
  registerReconcileController(container.useCases.reconcile, container.rootPathRef)
  registerDownloadController(
    container.useCases.fetchVideoInfo,
    container.useCases.downloadVideo,
    container.useCases.probeMediaFile,
    container.useCases.fetchChannelInfo
  )
  registerCreatorController(container.repositories.creator)
  registerVideoController(
    container.repositories.video,
    container.useCases.fetchVideoDetail,
    container.useCases.enrichAllVideos,
    container.useCases.fetchVideoComments,
    container.ports.fsReader
  )
  registerCutController(container.repositories.cut)
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
    console.error(`[klip] Operation recovery failed:`, error)
  }

  // ── Initial reconciliation (one-time full scan at startup) ──
  try {
    const result = container.useCases.reconcile.execute(rootPath)
    console.log(`[klip] Initial reconciliation complete:`, result)
  } catch (error) {
    console.error(`[klip] Initial reconciliation failed:`, error)
  }

  // ── Enrich media metadata for newly discovered entities (async, non-blocking) ──
  container.useCases.enrichMedia
    .execute()
    .then((enrichResult) => {
      if (enrichResult.videosProbed > 0 || enrichResult.cutsProbed > 0) {
        console.log(`[klip] Media enrichment complete:`, enrichResult)
      }
    })
    .catch((error) => console.error(`[klip] Media enrichment failed:`, error))

  // ── Start file watcher (runtime changes only, ignoreInitial: true) ──
  container.services.fileWatcher.start()

  createWindow()

  // ── Auto-check for updates (production only; DisabledUpdater is a no-op in dev) ──
  if (!is.dev) {
    container.ports.updater.checkForUpdates().catch((err) => {
      console.error(`[klip] Initial update check failed:`, err)
    })
  }

  app.on('activate', function () {
    // On macOS, it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
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
