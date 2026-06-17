import { realpathSync } from 'fs'
import { resolve as pathResolve, sep as pathSep } from 'path'

/**
 * Containment check for renderer-supplied filesystem paths.
 *
 * Returns true only when `requestedPath` resolves to `rootValue` itself or a
 * location strictly inside it. `realpathSync` collapses `..` segments and
 * resolves symlinks before comparison, so traversal (`${root}/../../etc`) and
 * symlink-based escapes are caught. Returns false if either path can't be
 * realpath'd (e.g. the target doesn't exist) — the caller should reject.
 *
 * Shared by the controllers that accept a free-form path from the renderer
 * (probe-media-file, open-path-in-shell) so the trust boundary is identical.
 */
export function isPathWithinRoot(requestedPath: string, rootValue: string): boolean {
  try {
    const realRoot = realpathSync(rootValue)
    const realRequested = realpathSync(pathResolve(requestedPath))
    return realRequested === realRoot || realRequested.startsWith(realRoot + pathSep)
  } catch {
    return false
  }
}
