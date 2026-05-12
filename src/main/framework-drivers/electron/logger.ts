import type { App } from 'electron'
import log from 'electron-log/main'
import { join } from 'path'

export interface LoggerOptions {
  /**
   * In dev mode the log file is written to `<cwd>/logs/klip-dev.log`
   * (inside the project directory) so the file is trivial to tail or
   * read with tooling that operates on the project tree. In production
   * it falls back to `<userData>/logs/klip.log`.
   */
  isDev?: boolean
}

/**
 * Initialise persistent logging for the main process.
 *
 * Behaviour:
 *   - File transport rotates at 5MB.
 *   - In dev, the file lives at `<cwd>/logs/klip-dev.log`; in prod, at
 *     `<userData>/logs/klip.log`. Dev path is project-local so manual
 *     test sessions leave an analysable trail next to the source.
 *   - `console.*` in the main process is monkey-patched onto electron-log
 *     so existing `console.log/error/warn` call sites land in the file
 *     without rewriting them.
 *   - Renderer-side `electron-log/renderer` forwards over IPC to this
 *     same file once `log.initialize()` has been called here.
 *   - Crash/exception listeners catch renderer + main + child-process
 *     failures so they leave a record on disk instead of vanishing.
 *
 * Must be called BEFORE `app.whenReady()` so `uncaughtException` during
 * boot is also captured.
 */
export function initLogger(app: App, options: LoggerOptions = {}): typeof log {
  const { isDev = false } = options

  // Registers the IPC bridge that `electron-log/renderer` talks to. Once
  // this runs, renderer-side log calls land in the same file as main.
  log.initialize()

  const logFilePath = isDev
    ? join(process.cwd(), 'logs', 'klip-dev.log')
    : join(app.getPath('logs'), 'klip.log')

  log.transports.file.resolvePathFn = (): string => logFilePath
  log.transports.file.maxSize = 5 * 1024 * 1024
  log.transports.file.level = isDev ? 'debug' : 'info'
  log.transports.console.level = isDev ? 'debug' : 'info'

  // Tag main-process entries so the merged file shows origin per-line.
  log.variables.processType = 'main'

  // Route every console.* call in the main process through electron-log so
  // pre-existing `console.log/error/warn` sites end up in the log file too.
  // `Object.assign(console, undefined)` is a no-op when `log.functions` is
  // absent (e.g. mocked in tests), so this is safe under test doubles.
  if (log.functions) {
    Object.assign(console, log.functions)
  }

  // Render-process-gone fires on a crash, kill, or OOM in any renderer
  // window. Without this listener, a renderer crash silently leaves the
  // user staring at a blank window and we have no breadcrumb.
  app.on('render-process-gone', (_event, _webContents, details) => {
    log.error('[klip] render-process-gone', details)
  })

  // child-process-gone covers utility / GPU processes spawned by Chromium
  // itself. yt-dlp + ffprobe are spawned via Node's child_process and are
  // outside Electron's process tree, so this won't catch their failures.
  app.on('child-process-gone', (_event, details) => {
    log.error('[klip] child-process-gone', details)
  })

  // Last-resort handlers for the main process. We log + rethrow so the
  // existing crash behaviour (process exit) is preserved — the file is the
  // forensic trail, not a swallow.
  process.on('uncaughtException', (error) => {
    log.error('[klip] uncaughtException', error)
  })
  process.on('unhandledRejection', (reason) => {
    log.error('[klip] unhandledRejection', reason)
  })

  return log
}
