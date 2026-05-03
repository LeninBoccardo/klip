import { app, shell } from 'electron'
import { realpathSync } from 'fs'
import { join, resolve as pathResolve, sep as pathSep } from 'path'
import log from 'electron-log/main'
import type { IResolveMediaUrl } from '@use-cases/IResolveMediaUrl'
import type { ICreatorRepository } from '@domain/repositories/ICreatorRepository'
import type { RootPathRef } from '@domain/ports'
import { createTypedHandler } from './create-typed-handler'
import { isHostAllowed } from '@main/framework-drivers/electron/security-hardening'

/**
 * IPC controller for OS-shell escape hatches.
 *
 * Registers:
 *   - `open-media-externally` → resolve a (kind, id) entity reference to a
 *     canonical filesystem path and open it in the OS default app
 *     (e.g. VLC for unsupported codecs).
 *   - `open-path-in-shell` → reveal a path under rootPath in the OS file
 *     manager. The path is realpath-validated to prevent symlink-based
 *     escapes outside the user's library.
 *   - `open-log-folder` → reveal the user's logs folder. Path resolved
 *     via `app.getPath('logs')` so the renderer never sees it.
 *   - `open-external-url` → open a URL in the OS default browser. Hosts
 *     are allowlisted (youtube.com / youtu.be) via the same set the
 *     security hardener uses, so the trust boundary is consistent.
 *
 * The handlers never trust the renderer's path verbatim; resolution goes
 * through `IResolveMediaUrl` (for kind/id) or a containment check against
 * `rootPath` (for free-form paths).
 */
export function registerShellController(
  resolveMediaUrl: IResolveMediaUrl,
  rootPath: RootPathRef,
  creatorRepo: ICreatorRepository
): void {
  createTypedHandler('open-media-externally', async (_event, kind, id) => {
    const path = resolveMediaUrl.resolve({ kind, id, asset: 'file' })
    if (!path) {
      return { ok: false, error: 'Media file not found.' }
    }

    // `openPath` returns an empty string on success and a non-empty error
    // message on failure (e.g. no associated handler). Surface either as a
    // typed result so the renderer can toast it without parsing strings.
    const error = await shell.openPath(path)
    if (error) return { ok: false, error }
    return { ok: true }
  })

  createTypedHandler('open-path-in-shell', async (_event, requestedPath) => {
    // Containment check: realpath both the request and the configured root,
    // then ensure the request is under the root. realpath collapses `..` and
    // resolves symlinks, so a request like `${root}/../../etc/passwd` (or a
    // symlink under root pointing outside) is caught.
    try {
      const realRoot = realpathSync(rootPath.value)
      const realRequested = realpathSync(pathResolve(requestedPath))
      if (realRequested !== realRoot && !realRequested.startsWith(realRoot + pathSep)) {
        return { ok: false, error: 'Path is outside the configured root folder.' }
      }
      shell.showItemInFolder(realRequested)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  createTypedHandler('open-log-folder', async () => {
    const logsPath = app.getPath('logs')
    const error = await shell.openPath(logsPath)
    if (error) return { ok: false, error }
    return { ok: true }
  })

  createTypedHandler('open-external-url', async (_event, requestedUrl) => {
    let parsed: URL
    try {
      parsed = new URL(requestedUrl)
    } catch {
      return { ok: false, error: 'Invalid URL.' }
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { ok: false, error: 'Only http(s) URLs are allowed.' }
    }
    if (!isHostAllowed(parsed.hostname)) {
      log.warn('[klip] shell: rejected external host', parsed.hostname)
      return { ok: false, error: 'Host is not on the external allowlist.' }
    }
    await shell.openExternal(parsed.toString())
    return { ok: true }
  })

  createTypedHandler('reveal-entity-in-folder', async (_event, kind, id) => {
    const path = resolveMediaUrl.resolve({ kind, id, asset: 'file' })
    if (!path) {
      return { ok: false, error: 'Media file not found.' }
    }
    try {
      shell.showItemInFolder(path)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  createTypedHandler('reveal-creator-folder', async (_event, creatorId) => {
    const creator = creatorRepo.findById(creatorId)
    if (!creator) {
      return { ok: false, error: 'Creator not found.' }
    }
    // Containment check: realpath both root and the creator-folder join,
    // then ensure the result is under root. The folder name comes from the
    // DB (not the renderer), but we still defend against a poisoned row
    // that bakes in `..` segments.
    try {
      const realRoot = realpathSync(rootPath.value)
      const requested = pathResolve(join(rootPath.value, creator.folderName))
      const realRequested = realpathSync(requested)
      if (realRequested !== realRoot && !realRequested.startsWith(realRoot + pathSep)) {
        return { ok: false, error: 'Creator folder is outside the configured root.' }
      }
      shell.showItemInFolder(realRequested)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
