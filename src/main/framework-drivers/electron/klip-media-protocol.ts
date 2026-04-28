import { realpathSync } from 'fs'
import { sep } from 'path'
import type { MediaKind, MediaAsset } from '@use-cases/IResolveMediaUrl'

/**
 * Pure URL-parsing and path-containment primitives for the `klip-media://`
 * protocol. The protocol orchestration (entity lookup + `protocol.handle()`
 * registration + `net.fetch`) lives in `KlipMediaProtocolHandler.ts`; this
 * module is split out so the parsing/containment decisions stay unit-testable
 * without an Electron environment.
 *
 * URL scheme (entity-keyed):
 *   klip-media://<kind>/<id>/<asset>
 *
 * Examples:
 *   klip-media://video/abc123/file
 *   klip-media://video/abc123/thumbnail
 *   klip-media://cut/2f9a-…/file
 *   klip-media://creator/jane-doe/avatar
 *
 * Path-based URLs (e.g. `klip-media://C:/Users/.../video.mp4`) are no longer
 * accepted — the renderer never holds raw filesystem paths. This eliminates
 * the entire path-traversal threat surface by construction; the realpath /
 * prefix-bounded containment check below remains as a defence-in-depth
 * second gate against bugs in the index.
 */

const VALID_KINDS: ReadonlySet<MediaKind> = new Set(['video', 'cut', 'creator'])
const VALID_ASSETS: ReadonlySet<MediaAsset> = new Set(['file', 'thumbnail', 'avatar'])

export type KlipMediaUrlParse =
  | { ok: true; kind: MediaKind; id: string; asset: MediaAsset }
  | { ok: false; status: 400 }

/**
 * Parse a `klip-media://<kind>/<id>/<asset>` URL into its components.
 * Returns `{ ok: false, status: 400 }` for any malformed input — including
 * legacy path-based URLs, missing segments, or unknown kind/asset values.
 */
export function parseKlipMediaUrl(url: string): KlipMediaUrlParse {
  const stripped = url.replace(/^klip-media:\/\//, '')
  if (!stripped) return { ok: false, status: 400 }

  const segments = stripped.split('/')
  if (segments.length !== 3) return { ok: false, status: 400 }

  const [rawKind, rawId, rawAsset] = segments
  // Defensive decode — IDs are URL-safe by construction (slugified or UUID),
  // but the renderer encodes anyway and the parser must symmetrically decode.
  const kind = decodeURIComponent(rawKind)
  const id = decodeURIComponent(rawId)
  const asset = decodeURIComponent(rawAsset)

  if (!id) return { ok: false, status: 400 }
  if (!VALID_KINDS.has(kind as MediaKind)) return { ok: false, status: 400 }
  if (!VALID_ASSETS.has(asset as MediaAsset)) return { ok: false, status: 400 }

  return { ok: true, kind: kind as MediaKind, id, asset: asset as MediaAsset }
}

export type KlipMediaPathCheck =
  | { ok: true; absolutePath: string }
  | { ok: false; status: 403 | 404 | 500 }

/**
 * Verify that `absolutePath` (already resolved from the entity index) sits
 * inside the active root path. Both sides are realpath-resolved first so
 * symlink escape is caught, and the trailing `sep` prevents
 * `<root>-evil/` aliasing.
 *
 * - `404` if the requested path no longer exists on disk
 * - `403` if the path resolves outside the root
 * - `500` if the configured root itself cannot be resolved
 *
 * This is belt-and-braces — under the entity-keyed scheme, the path comes
 * from a row that the main process trusts. The check defends against future
 * bugs that might write a tampered path into a row.
 */
export function checkPathInsideRoot(absolutePath: string, rootPath: string): KlipMediaPathCheck {
  let resolvedRequest: string
  try {
    resolvedRequest = realpathSync(absolutePath)
  } catch {
    return { ok: false, status: 404 }
  }

  let resolvedRoot: string
  try {
    resolvedRoot = realpathSync(rootPath)
  } catch {
    return { ok: false, status: 500 }
  }

  if (resolvedRequest !== resolvedRoot && !resolvedRequest.startsWith(resolvedRoot + sep)) {
    return { ok: false, status: 403 }
  }

  return { ok: true, absolutePath: resolvedRequest }
}
