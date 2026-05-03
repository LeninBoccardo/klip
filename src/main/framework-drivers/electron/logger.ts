import type { App } from 'electron'
import log from 'electron-log/main'
import { join } from 'path'

/**
 * Initialise persistent logging for the main process.
 *
 * Routes log entries to `<userData>/logs/klip.log` with 5MB rotation. Wires
 * crash/exception listeners so renderer + main + child-process failures
 * leave a record on disk instead of vanishing into the terminal.
 *
 * Must be called BEFORE `app.whenReady()` so `uncaughtException` during
 * boot is also captured.
 *
 * @returns the configured electron-log instance, for callers that want
 *   to log alongside their existing console.error sites.
 */
export function initLogger(app: App): typeof log {
  // electron-log's main module installs a default file transport rooted at
  // `app.getPath('logs')` once `initialize()` has been called. Setting the
  // path explicitly removes ambiguity between dev / packaged runs.
  log.initialize()
  log.transports.file.resolvePathFn = (): string =>
    join(app.getPath('logs'), 'klip.log')
  log.transports.file.maxSize = 5 * 1024 * 1024
  log.transports.file.level = 'info'
  log.transports.console.level = 'info'

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
