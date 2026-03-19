import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initializeDatabase } from './framework-drivers/database'
import {
  SqliteCreatorRepository,
  SqliteVideoRepository,
  SqliteCutRepository
} from './interface-adapters/repositories'
import { NodeFileSystemReader } from './interface-adapters/file-system'
import { ReconcileDirectory } from '@use-cases/ReconcileDirectory'
import { ProcessFileNotifications } from '@use-cases/ProcessFileNotifications'
import { registerReconcileController } from './interface-adapters/controllers/ReconcileController'
import { PQueueNotificationQueue } from './interface-adapters/queue'
import { NodeDebouncer } from './framework-drivers/timers'
import { ElectronNotifier } from './framework-drivers/electron/ElectronNotifier'
import { ChokidarWatcher } from './framework-drivers/file-system/ChokidarWatcher'
import type { ICreatorRepository, IVideoRepository, ICutRepository } from '@domain/repositories'
import type { IFileWatcher } from '@domain/ports'

// ── Repository singletons (initialised in createDb, consumed by IPC controllers) ──
export let creatorRepository: ICreatorRepository
export let videoRepository: IVideoRepository
export let cutRepository: ICutRepository

// ── Notification processor + file watcher (initialised in app.whenReady) ──
export let processNotifications: ProcessFileNotifications
let fileWatcher: IFileWatcher
let debouncer: NodeDebouncer

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
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

function createDb(): void {
  const dbPath = join(app.getPath('userData'), 'klip.db')
  const db = initializeDatabase(dbPath)

  creatorRepository = new SqliteCreatorRepository(db)
  videoRepository = new SqliteVideoRepository(db)
  cutRepository = new SqliteCutRepository(db)

  console.log(`[klip] Database initialised at ${dbPath}`)
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

  createDb()

  // ── Reconciliation setup ──
  const rootPath = join(app.getPath('documents'), 'klip')
  const fsReader = new NodeFileSystemReader()
  const reconcile = new ReconcileDirectory(
    creatorRepository,
    videoRepository,
    cutRepository,
    fsReader
  )
  registerReconcileController(reconcile, rootPath)
  console.log(`[klip] Reconciliation controller registered (root: ${rootPath})`)

  // ── Notification queue setup ──
  const notificationQueue = new PQueueNotificationQueue()
  debouncer = new NodeDebouncer()
  const electronNotifier = new ElectronNotifier()
  processNotifications = new ProcessFileNotifications(
    notificationQueue,
    debouncer,
    reconcile,
    electronNotifier,
    rootPath
  )
  console.log(`[klip] Notification queue initialised (debounce: 1000ms, threshold: 50)`)

  // ── Initial reconciliation (one-time full scan at startup) ──
  try {
    const result = reconcile.execute(rootPath)
    console.log(`[klip] Initial reconciliation complete:`, result)
  } catch (error) {
    console.error(`[klip] Initial reconciliation failed:`, error)
  }

  // ── File watcher setup (runtime changes only, ignoreInitial: true) ──
  fileWatcher = new ChokidarWatcher(rootPath)
  fileWatcher.onEvent((event) => processNotifications.handleEvent(event))
  fileWatcher.start()

  createWindow()

  app.on('activate', function () {
    // On macOS, it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Graceful shutdown: stop watcher and cancel pending debounce before quit
app.on('before-quit', () => {
  fileWatcher?.stop()
  debouncer?.cancel()
  console.log('[klip] File watcher stopped, debouncer cancelled')
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
