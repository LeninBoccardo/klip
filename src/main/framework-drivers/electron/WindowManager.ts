import { BrowserWindow } from 'electron'
import { join } from 'path'
import type { IWindowManager } from '@domain/ports'

interface WindowManagerConfig {
  preloadPath: string
  rendererHtmlPath: string
  iconPath: string
  /**
   * Mirrors `is.dev` from `@electron-toolkit/utils`. Threaded explicitly
   * rather than pulled from the toolkit so this module imports nothing
   * that, transitively, breaks vite-node when `electron` is mocked in
   * unit tests (the toolkit imports the full `electron` namespace and
   * doesn't survive the test's stubbed module).
   */
  isDev: boolean
}

/**
 * Electron-backed `IWindowManager`. Owns the main window plus a single
 * editor window (per the 1-of-N policy in plan §9.3). Both windows share
 * the same preload, the same renderer entry, and the same `webPreferences`
 * lock — the only difference is the URL hash, which the renderer reads
 * to decide whether to mount `<MainApp />` or `<EditorApp />`.
 *
 * The editor window does *not* set `parent: mainWindow` — making the
 * editor a modal child would disable the main window on macOS and create
 * stacking weirdness on Windows. The user explicitly asked to keep the
 * main window usable while editing.
 */
export class ElectronWindowManager implements IWindowManager {
  private mainWindow: BrowserWindow | null = null
  private editorWindow: BrowserWindow | null = null

  constructor(private readonly config: WindowManagerConfig) {}

  createMainWindow(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.focus()
      return
    }
    this.mainWindow = this.spawnWindow({ kind: 'main' })
  }

  recreateMainWindowIfClosed(): void {
    if (BrowserWindow.getAllWindows().length === 0) {
      this.createMainWindow()
    }
  }

  openEditorWindow(input: { sourceVideoId: string }): void {
    if (this.editorWindow && !this.editorWindow.isDestroyed()) {
      // 1-of-N policy: focus the existing editor window and navigate it
      // to the new source video. The renderer listens for hashchange and
      // remounts the editor route with the new param.
      this.editorWindow.focus()
      this.navigateToEditor(this.editorWindow, input.sourceVideoId)
      return
    }
    this.editorWindow = this.spawnWindow({ kind: 'editor', sourceVideoId: input.sourceVideoId })
    this.editorWindow.on('closed', () => {
      this.editorWindow = null
    })
  }

  // ── Private ──

  private spawnWindow(target: { kind: 'main' } | { kind: 'editor'; sourceVideoId: string }): BrowserWindow {
    const isEditor = target.kind === 'editor'
    const window = new BrowserWindow({
      width: isEditor ? 1280 : 1280,
      height: isEditor ? 800 : 936,
      // The editor's content can shrink below the main window's minimums
      // because there's no sidebar; the timeline still wants ~900px to
      // not feel cramped.
      minWidth: isEditor ? 900 : 1024,
      minHeight: isEditor ? 600 : 720,
      show: false,
      autoHideMenuBar: true,
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#1c1815',
        symbolColor: '#f5ecd5',
        height: 32
      },
      backgroundColor: '#1c1815',
      ...(process.platform === 'linux' ? { icon: this.config.iconPath } : {}),
      webPreferences: {
        preload: this.config.preloadPath,
        // Pinned exactly as the original main-window block; both windows
        // ride on the same hardened bridge. Diverging here would silently
        // weaken the editor window's defence-in-depth.
        contextIsolation: true,
        sandbox: true,
        webSecurity: true
      }
    })

    window.on('ready-to-show', () => window.show())

    if (this.config.isDev) {
      window.webContents.on('console-message', (details) => {
        console.log(
          `[renderer:${details.level}] ${details.sourceId}:${details.lineNumber} ${details.message}`
        )
      })
      window.webContents.on('preload-error', (_event, preloadPath, error) => {
        console.error(`[klip] preload-error at ${preloadPath}:`, error)
      })
    }

    if (isEditor) {
      this.navigateToEditor(window, target.sourceVideoId)
    } else {
      this.navigateToMain(window)
    }

    return window
  }

  private navigateToMain(window: BrowserWindow): void {
    if (this.config.isDev && process.env['ELECTRON_RENDERER_URL']) {
      window.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      window.loadFile(this.config.rendererHtmlPath)
    }
  }

  private navigateToEditor(window: BrowserWindow, sourceVideoId: string): void {
    // The renderer reads `window.location.hash` and mounts <EditorApp />
    // when it starts with '#/editor/'. The hash is encodeURIComponent'd
    // because while sourceVideoId is a yt-dlp ID in practice (and
    // url-safe), the hash carries it through `decodeURIComponent` on the
    // renderer side, so symmetric encoding keeps that path honest.
    const safeId = encodeURIComponent(sourceVideoId)
    if (this.config.isDev && process.env['ELECTRON_RENDERER_URL']) {
      window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/editor/${safeId}`)
    } else {
      window.loadFile(this.config.rendererHtmlPath, { hash: `/editor/${safeId}` })
    }
  }
}

/**
 * Path-aware factory used by `src/main/index.ts`. Centralises the
 * `__dirname` math (out/main → preload + renderer) so both the boot
 * script and the editor controller resolve the same artifacts.
 */
export function createElectronWindowManager(opts: {
  iconPath: string
  isDev: boolean
}): ElectronWindowManager {
  return new ElectronWindowManager({
    preloadPath: join(__dirname, '../preload/index.js'),
    rendererHtmlPath: join(__dirname, '../renderer/index.html'),
    iconPath: opts.iconPath,
    isDev: opts.isDev
  })
}
