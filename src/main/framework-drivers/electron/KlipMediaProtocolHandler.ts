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
 * Windows, `.mp4` can come back as `application/octet-stream` if the
 * registry mapping is missing, and HTML5 `<video>` refuses any source
 * with an unrecognised MIME. Pinning these defensively makes the
 * protocol response self-describing regardless of OS state.
 *
 * `.mkv` is deliberately NOT in this table. Earlier we tried mapping
 * it to `video/webm` to coax Chromium into using its shared
 * Matroska/WebM demuxer. The demuxer reads the file's EBML DocType
 * header at parse time: WebM declares `DocType=webm`, plain Matroska
 * declares `DocType=matroska`. yt-dlp produces matroska-DocType files
 * even when we forced `--merge-output-format mkv`, so the demuxer
 * rejects the cross-claim with `MEDIA_ERR_SRC_NOT_SUPPORTED`. There
 * is no MIME we can serve that makes Chromium accept a matroska-
 * DocType file in `<video>`. The fix lives upstream in
 * `YtDlpDownloader`'s container choice (`mp4/webm` — picks the
 * matching container per codec). `.mkv` falling through this table
 * means the protocol returns whatever Chromium guesses; that won't
 * play, but at least the failure is honest and we don't pretend.
 */
const EXT_TO_MIME: Record<string, string> = {
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
/**
 * `request.url` is fully renderer-controlled (any HTML/CSS/fetch can issue an
 * arbitrary `klip-media://` request). Drop ASCII control chars — chiefly CR/LF,
 * which could otherwise forge fake lines in the persistent log — and cap the
 * length so an over-long URL can't bloat the file. Defence-in-depth: Chromium
 * already strips control chars from URLs, but this is the one log surface that
 * emits untrusted input verbatim (F87).
 */
function sanitizeUrlForLog(url: string): string {
  // Drop ASCII control chars (incl. CR/LF that could forge log lines) and cap
  // length. Built character-wise (no control-char regex) so the source stays clean.
  return [...url]
    .filter((c) => {
      const code = c.charCodeAt(0)
      return code >= 0x20 && code !== 0x7f
    })
    .join('')
    .slice(0, 512)
}

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
    const safeUrl = sanitizeUrlForLog(request.url)
    console.log(
      `[klip-media] ← ${request.method} ${safeUrl}${rangeHeader ? ` range=${rangeHeader}` : ''}`
    )

    // Read-only media endpoint: only GET/HEAD are meaningful. Reject anything
    // else explicitly (405) rather than silently serving the body via the
    // method-agnostic net.fetch path (F86).
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      console.warn(`[klip-media] reject 405 method=${request.method}`)
      return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } })
    }

    const parsed = parseKlipMediaUrl(request.url)
    if (!parsed.ok) {
      console.warn(`[klip-media] reject ${parsed.status} parseKlipMediaUrl: ${safeUrl}`)
      return new Response(null, { status: parsed.status })
    }
    console.log(`[klip-media] parsed: kind=${parsed.kind} id=${parsed.id} asset=${parsed.asset}`)

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
    console.log(`[klip-media] resolved path: ${redactPath(path, this.rootPathRef.value)}`)

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
    console.log(`[klip-media] stat OK: size=${stat.size} mtime=${stat.mtime.toISOString()}`)

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
