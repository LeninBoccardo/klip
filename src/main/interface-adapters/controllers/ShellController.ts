import { shell } from 'electron'
import type { IResolveMediaUrl } from '@use-cases/IResolveMediaUrl'
import { createTypedHandler } from './create-typed-handler'

/**
 * IPC controller for OS-shell escape hatches.
 *
 * Registers:
 *   - `open-media-externally` → resolve a (kind, id) entity reference to a
 *     canonical filesystem path and open it in the OS default app
 *     (e.g. VLC for unsupported codecs).
 *
 * The handler never accepts a renderer-supplied path; resolution goes through
 * `IResolveMediaUrl` so the same containment guarantees as `klip-media://`
 * apply.
 */
export function registerShellController(resolveMediaUrl: IResolveMediaUrl): void {
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
}
