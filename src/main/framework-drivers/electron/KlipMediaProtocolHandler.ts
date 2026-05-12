import { protocol, net } from 'electron'
import { statSync } from 'fs'
import { extname } from 'path'
import { pathToFileURL } from 'url'
import type { IResolveMediaUrl } from '@use-cases/IResolveMediaUrl'
import type { RootPathRef } from '@domain/ports'
import { redactPath } from '@domain/types/redact'
import { parseKlipMediaUrl, checkPathInsideRoot } from './klip-media-protocol'

/**
 * Mime-type override table for the protocol's responses. Chromium's
 * built-in file MIME guesser is inconsistent across platforms — on
 * Windows, `.mkv` often comes back as `application/octet-stream` (or
 * `video/x-matroska` if the registry has it), and HTML5 `<video>`
 * refuses to play either. Specifically, `canPlayType('video/x-matroska')`
 * returns `''` even though Chromium's Matroska/WebM demuxer is built
 * in and would happily decode the file. Forcing `video/webm` for `.mkv`
 * routes the response through the same demuxer with a MIME `<video>`
 * recognises — playback works without any container/transcode change.
 *
 * `.mp4` we also pin explicitly: defends against a misconfigured
 * Windows MIME registry returning something unexpected. Image MIMEs
 * are pinned so the renderer's `<img>` tags work for thumbnails /
 * avatars even when Chromium's sniffer is uncertain.
 */
const EXT_TO_MIME: Record<string, string> = {
  '.mkv': 'video/webm',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.mp3': 'audio/mpeg',
  '.opus': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

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

  private async handle(request: Request): Promise<Response> {
    const rangeHeader = request.headers.get('range')
    console.log(
      `[klip-media] ← ${request.method} ${request.url}${rangeHeader ? ` range=${rangeHeader}` : ''}`
    )

    const parsed = parseKlipMediaUrl(request.url)
    if (!parsed.ok) {
      console.warn(`[klip-media] reject ${parsed.status} parseKlipMediaUrl: ${request.url}`)
      return new Response(null, { status: parsed.status })
    }
    console.log(
      `[klip-media] parsed: kind=${parsed.kind} id=${parsed.id} asset=${parsed.asset}`
    )

    const path = this.resolveMedia.resolve({
      kind: parsed.kind,
      id: parsed.id,
      asset: parsed.asset
    })
    if (path === null) {
      console.warn(
        `[klip-media] reject 404 resolveMedia returned null (kind=${parsed.kind} id=${parsed.id} asset=${parsed.asset})`
      )
      return new Response(null, { status: 404 })
    }
    console.log(
      `[klip-media] resolved path: ${redactPath(path, this.rootPathRef.value)}`
    )

    const checked = checkPathInsideRoot(path, this.rootPathRef.value)
    if (!checked.ok) {
      console.warn(
        `[klip-media] reject ${checked.status} checkPathInsideRoot: ${redactPath(path, this.rootPathRef.value)} (root: ${redactPath(this.rootPathRef.value, this.rootPathRef.value)})`
      )
      return new Response(null, { status: checked.status })
    }

    // Explicit stat-then-classify so failures here produce a real
    // diagnostic in the log, instead of a silent `net.fetch` that the
    // renderer's <video> reports as "Browser can't play this codec".
    let stat
    try {
      stat = statSync(checked.absolutePath)
    } catch (err) {
      console.warn(
        `[klip-media] reject 404 stat threw for ${redactPath(checked.absolutePath, this.rootPathRef.value)}: ${err instanceof Error ? err.message : err}`
      )
      return new Response(null, { status: 404 })
    }
    if (!stat.isFile()) {
      console.warn(
        `[klip-media] reject 404 resolved path is not a regular file (kind=${parsed.kind}, id=${parsed.id}, asset=${parsed.asset}): ${redactPath(checked.absolutePath, this.rootPathRef.value)}`
      )
      return new Response(null, { status: 404 })
    }
    console.log(
      `[klip-media] stat OK: size=${stat.size} mtime=${stat.mtime.toISOString()}`
    )

    const upstream = await net.fetch(pathToFileURL(checked.absolutePath).href)
    const ext = extname(checked.absolutePath).toLowerCase()
    const upstreamCT = upstream.headers.get('content-type')
    const override = EXT_TO_MIME[ext]
    const finalCT = override ?? upstreamCT ?? '(none)'
    console.log(
      `[klip-media] → status=${upstream.status} ext=${ext} upstream-CT=${upstreamCT ?? '(none)'} final-CT=${finalCT}${override ? ' (overridden)' : ''}`
    )
    if (!override) return upstream

    // Rewrap with the corrected Content-Type. We keep the upstream body
    // (which honours byte-range requests via Chromium's file handler —
    // critical for `<video>` seekability) and only swap the response's
    // headers. Range / 206 status / Content-Length carry through.
    const headers = new Headers(upstream.headers)
    headers.set('Content-Type', override)
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers
    })
  }
}
