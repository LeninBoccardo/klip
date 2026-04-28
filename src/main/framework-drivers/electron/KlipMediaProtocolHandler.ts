import { protocol, net } from 'electron'
import { pathToFileURL } from 'url'
import type { IResolveMediaUrl } from '@use-cases/IResolveMediaUrl'
import type { RootPathRef } from '@domain/ports'
import { parseKlipMediaUrl, checkPathInsideRoot } from './klip-media-protocol'

/**
 * Registers and serves the `klip-media://` custom protocol.
 *
 * Wires three pure pieces:
 *   1. `parseKlipMediaUrl`           — entity-keyed URL → (kind, id, asset)
 *   2. `IResolveMediaUrl.resolve`    — entity ref → canonical filesystem path
 *   3. `checkPathInsideRoot`         — realpath/prefix containment as defence-in-depth
 *
 * The renderer never holds raw filesystem paths under this scheme, so a
 * poisoned comment / metadata field cannot construct a working
 * `<img src="klip-media://C:/Windows/...">` URL — the parser rejects it
 * with 400 before any FS access happens.
 *
 * The `rootPathRef` is read on every request, so `migrate-root` mid-session
 * re-points the protocol without re-registering the handler.
 *
 * `protocol.registerSchemesAsPrivileged()` for `klip-media` must be called
 * *before* `app.whenReady()` (Electron requirement); this class only owns
 * `protocol.handle()`, which runs after `whenReady`.
 */
export class KlipMediaProtocolHandler {
  constructor(
    private readonly resolveMedia: IResolveMediaUrl,
    private readonly rootPathRef: RootPathRef
  ) {}

  register(): void {
    protocol.handle('klip-media', (request) => this.handle(request))
  }

  private handle(request: Request): Response | Promise<Response> {
    const parsed = parseKlipMediaUrl(request.url)
    if (!parsed.ok) {
      return new Response(null, { status: parsed.status })
    }

    const path = this.resolveMedia.resolve({
      kind: parsed.kind,
      id: parsed.id,
      asset: parsed.asset
    })
    if (path === null) {
      return new Response(null, { status: 404 })
    }

    const checked = checkPathInsideRoot(path, this.rootPathRef.value)
    if (!checked.ok) {
      return new Response(null, { status: checked.status })
    }

    return net.fetch(pathToFileURL(checked.absolutePath).href)
  }
}
