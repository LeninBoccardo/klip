import { app, session, shell } from 'electron'
import type { Session, WebContents } from 'electron'
import log from 'electron-log/main'

/**
 * Hosts whose URLs we'll forward to the user's default browser via
 * `shell.openExternal`. Anything else is denied so a compromised renderer
 * cannot use the OS shell as a phishing trampoline. The list is intentionally
 * tight — the only legitimate "open externally" target today is the original
 * YouTube video page.
 */
const EXTERNAL_HOST_ALLOWLIST: readonly string[] = [
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be'
] as const

function isHostAllowed(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  return EXTERNAL_HOST_ALLOWLIST.includes(lower)
}

/**
 * Returns true when the URL is safe to load inside a klip BrowserWindow.
 * Allowed:
 *   - the renderer entry point (file:// in prod, the dev server URL in dev)
 *   - the custom `klip-media://` scheme used for entity-keyed media URLs
 *
 * Everything else — `https://`, `http://`, `data:`, `javascript:`, etc. — is
 * blocked. Cross-origin navigation is the textbook XSS-amplification vector
 * in Electron, even with sandbox + contextIsolation.
 */
export function isInternalNavigation(targetUrl: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(targetUrl)
  } catch {
    return false
  }

  if (parsed.protocol === 'klip-media:') return true

  // Dev server: e.g. http://localhost:5173/. Compare full origin so a
  // compromised renderer can't slip in a same-port attacker URL.
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    try {
      const dev = new URL(devUrl)
      if (parsed.origin === dev.origin) return true
    } catch {
      // ignore — devUrl is malformed, treat as no dev allowance
    }
  }

  // Production: the renderer is loaded from file://…/out/renderer/index.html.
  // Allowing the entire `file:` scheme would re-open the door to local-file
  // exfil; require a canonical bundle suffix instead.
  if (parsed.protocol === 'file:' && parsed.pathname.endsWith('/index.html')) {
    return true
  }

  return false
}

function maybeOpenExternal(rawUrl: string): void {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    log.warn('[klip] security: rejected unparsable URL', rawUrl)
    return
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    log.warn('[klip] security: rejected non-http(s) external URL', parsed.protocol)
    return
  }
  if (!isHostAllowed(parsed.hostname)) {
    log.warn('[klip] security: rejected external host', parsed.hostname)
    return
  }
  void shell.openExternal(parsed.toString())
}

function hardenContents(contents: WebContents): void {
  contents.on('will-navigate', (event, url) => {
    if (isInternalNavigation(url)) return
    event.preventDefault()
    maybeOpenExternal(url)
  })

  contents.setWindowOpenHandler(({ url }) => {
    maybeOpenExternal(url)
    return { action: 'deny' }
  })
}

/**
 * Apply defence-in-depth security to the main process. Run once before
 * `app.whenReady()` resolves so the listeners are wired before any window
 * exists.
 *
 * Layers:
 *   1. Global `web-contents-created` hook — every new window/webview gets
 *      will-navigate + setWindowOpenHandler.
 *   2. Permission handlers — deny all unsolicited media/geolocation/etc.
 *      requests. Klip never legitimately needs these; allowing them by
 *      default is a footgun.
 *
 * `webSecurity: true`, `contextIsolation: true`, `sandbox: true` are still
 * the responsibility of the BrowserWindow ctor; this module assumes the
 * caller has already pinned them.
 *
 * @param sessionFactory  optional override (used by tests). Defaults to
 *   `session.defaultSession`.
 */
export function applySecurityHardening(
  sessionFactory: () => Session = () => session.defaultSession
): void {
  app.on('web-contents-created', (_event, contents) => {
    hardenContents(contents)
  })

  const s = sessionFactory()
  s.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false)
  })
  s.setPermissionCheckHandler(() => false)
}
