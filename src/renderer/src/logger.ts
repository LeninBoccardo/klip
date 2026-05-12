import log from 'electron-log/renderer'

/**
 * Side-effect module imported first thing from the renderer entry so all
 * renderer-side diagnostics flow to the shared log file managed by main.
 *
 * Infinite-loop guard:
 *   electron-log's renderer `console` transport writes by calling
 *   `console.log/info/warn/error/debug` directly. If we naïvely did
 *   `Object.assign(console, log.functions)`, the patched `console.log`
 *   would re-enter electron-log, fire transports again, hit the console
 *   transport, call `console.log`, …forever. We dodge it by:
 *     1. Capturing the *original* console methods first.
 *     2. Disabling the renderer's console transport (so log.* never
 *        re-enters console).
 *     3. Replacing `console.*` with thin wrappers that call BOTH the
 *        captured original (DevTools still shows the message) AND
 *        `log.*` (IPC to main → log file).
 *
 * Requires `log.initialize()` to have been called in main (see
 * `src/main/framework-drivers/electron/logger.ts`) so the IPC channel
 * is set up.
 */

log.variables.processType = 'renderer'

// Snapshot the original methods BEFORE any patching — these are the
// genuine browser console functions and are guaranteed not to recurse.
const original = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console)
}

// Disable electron-log's local console transport. Without this, log.*
// would still try to write through `console.*` (now our wrapper) and
// re-enter the log pipeline. DevTools output is preserved by the wrapper
// below which calls the captured original directly.
log.transports.console.level = false

console.log = (...args: unknown[]): void => {
  original.log(...args)
  log.info(...args)
}
console.info = (...args: unknown[]): void => {
  original.info(...args)
  log.info(...args)
}
console.warn = (...args: unknown[]): void => {
  original.warn(...args)
  log.warn(...args)
}
console.error = (...args: unknown[]): void => {
  original.error(...args)
  log.error(...args)
}
console.debug = (...args: unknown[]): void => {
  original.debug(...args)
  log.debug(...args)
}

window.addEventListener('error', (event) => {
  log.error('[klip:renderer] window.error', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: serializeError(event.error)
  })
})

window.addEventListener('unhandledrejection', (event) => {
  log.error('[klip:renderer] unhandledrejection', serializeError(event.reason))
})

function serializeError(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack }
  }
  return value
}
