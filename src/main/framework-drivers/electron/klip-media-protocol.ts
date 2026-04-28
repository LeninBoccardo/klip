import { realpathSync } from 'fs'
import { isAbsolute, sep } from 'path'

/**
 * Result of validating a `klip-media://` request against the active root path.
 *
 * The handler surface lives in `src/main/index.ts`; this module is the pure
 * (modulo `realpath`) decision: either the request resolves to a path that's
 * provably inside the root, or it gets rejected with the appropriate HTTP-style
 * status. Keeping the decision separable from `protocol.handle()` is what
 * makes the containment behaviour unit-testable.
 */
export type KlipMediaResolution =
  | { ok: true; absolutePath: string }
  | { ok: false; status: 400 | 403 | 404 | 500 }

/**
 * Decide whether a `klip-media://` request may be served, and if so, the
 * canonical absolute path to fetch.
 *
 * The check is **realpath-based + prefix-bounded**: both the requested path
 * and the configured root are resolved via `realpathSync` first (which follows
 * symlinks), then the resolved request must equal the resolved root or sit
 * strictly under it (`+ sep` prevents `<root>-evil/` aliasing). This catches:
 *
 *   - URL-encoded traversal (`%2E%2E%2F` etc.) — `decodeURIComponent` runs first.
 *   - Symlink escape — `realpathSync` walks links to ground truth.
 *   - Sibling-prefix aliasing — the trailing `sep` excludes `<root>-evil`.
 *
 * Relative URLs are rejected outright (`400`) — every internal call site
 * builds absolute paths via `pathResolver.join(rootPath, ...)`, so a relative
 * request can only come from a malformed or attacker-crafted URL.
 */
export function resolveKlipMediaRequest(url: string, rootPath: string): KlipMediaResolution {
  const decoded = decodeURIComponent(url.replace(/^klip-media:\/\//, ''))
  if (!decoded || !isAbsolute(decoded)) {
    return { ok: false, status: 400 }
  }

  let resolvedRequest: string
  try {
    resolvedRequest = realpathSync(decoded)
  } catch {
    return { ok: false, status: 404 }
  }

  let resolvedRoot: string
  try {
    resolvedRoot = realpathSync(rootPath)
  } catch {
    // Misconfigured root — fail closed.
    return { ok: false, status: 500 }
  }

  if (resolvedRequest !== resolvedRoot && !resolvedRequest.startsWith(resolvedRoot + sep)) {
    return { ok: false, status: 403 }
  }

  return { ok: true, absolutePath: resolvedRequest }
}
