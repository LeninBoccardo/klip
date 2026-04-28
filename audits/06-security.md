# Audit 06 — Security

Step 6 of [plans/plan-codeOverview.prompt.md](../plans/plan-codeOverview.prompt.md). The final pass: a threat-model-driven security audit of the Electron app.

---

## Threat model

**Klip is a single-user desktop application.** The user runs it on their own machine to organise YouTube downloads. The user is the trusted operator — we do not model malware-on-the-machine, shoulder-surfing, or local privilege escalation.

**Trust boundaries we DO model:**

1. **Stored YouTube content** — comment text, video descriptions, transcripts, channel metadata, video titles. These fields originate from YouTube uploaders and are persisted to the local filesystem and SQLite DB. A malicious uploader could craft fields that, if rendered insecurely, achieve XSS in the renderer process. **A compromised renderer can in turn invoke any `window.api` channel and send arbitrary payloads to the main process.**
2. **Tampered file-system contents** — `meta.json`, `creator.json`, `cut-data.json` files under the root path. Possible if the user grants another process write access (e.g., a sync tool).
3. **Argument injection through URLs / file paths** that reach `child_process.spawn` (yt-dlp, ffprobe).
4. **Custom protocol abuse** — `klip-media://` requests originating from any rendered HTML/CSS context.

**Out of scope:**

- Network MITM (HTTPS assumed sufficient).
- Supply-chain compromise of NPM dependencies (separate review).
- Tampering with bundled `yt-dlp` / `ffprobe` binaries on disk after install (would require local-write access).
- Threats requiring local-shell access on the user's machine.
- Multi-user / shared-install scenarios.

**Severity rubric (per Step 6 spec):**

| Severity     | Bar                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------- |
| **CRITICAL** | Remote code execution or arbitrary data exfiltration. Must fix before ship.                        |
| **HIGH**     | Local privilege escalation or data tampering. Fix before ship unless explicit accept-risk.         |
| **MEDIUM**   | Information disclosure or hardening gap with realistic attacker capability under our threat model. |
| **LOW**      | Defense-in-depth gap. Cheap to fix; small marginal benefit.                                        |

---

## Findings summary

| ID     | Severity       | Surface                                                        | Status                                      |
| ------ | -------------- | -------------------------------------------------------------- | ------------------------------------------- |
| F1     | **CRITICAL**   | `klip-media://` arbitrary file read                            | fix                                         |
| F2     | **HIGH**       | Renderer `sandbox: false` + implicit `contextIsolation`        | fix                                         |
| F3     | **HIGH**       | Production code-signing not configured                         | `[needs-product-decision]` (linked: F-PD-2) |
| F4     | **MEDIUM**     | No runtime IPC payload validation                              | fix                                         |
| F5     | **MEDIUM**     | Logging hygiene — paths in stdout/stderr                       | fix (linked: F-PD-3)                        |
| F6     | **MEDIUM**     | `JSON.parse` without runtime schema                            | fix                                         |
| F7     | **MEDIUM**     | yt-dlp output-template `videoId` interpolation                 | fix                                         |
| F8     | **LOW**        | Bundled binary checksum verification missing                   | fix                                         |
| F9     | **LOW**        | `download-binaries.ts` uses `execSync` with interpolated paths | fix                                         |
| F10    | **LOW**        | CSP missing explicit `object-src 'none'`                       | fix                                         |
| F11    | **LOW**        | `autoDownload + autoInstallOnAppQuit` without explicit consent | defer (UX decision)                         |
| F-PD-1 | needs-decision | DB-at-rest encryption (SQLCipher)                              | recommend defer                             |
| F-PD-2 | needs-decision | Production code-signing (Apple + Windows)                      | recommend adopt before public release       |
| F-PD-3 | needs-decision | Log/telemetry redaction policy                                 | recommend adopt now                         |

**Tally.** 11 technical findings (1 CRITICAL, 2 HIGH, 4 MEDIUM, 4 LOW) + 3 product-decision items.

---

## Findings — CRITICAL

### F1 — `klip-media://` arbitrary file read — CRITICAL

**Threat scenario.** A malicious YouTube comment or video description renders an `<img src="klip-media://C:/Users/<user>/Documents/secrets.txt">`. The renderer fetches it via `klip-media://`. The protocol handler decodes the URL, resolves the path, and returns the file contents as the `<img>` body. With CSP `img-src ... klip-media:` permitting the protocol, the only thing stopping exfiltration is the protocol handler itself — which has no path containment.

The threat model assumes attacker-influenced stored content (comments / metadata / transcripts). The CSP's `script-src 'self'` blocks classic XSS, but `<img onerror>` is _not_ a script and the CSP doesn't apply to error-channel exfiltration via image dimensions or via timing.

**Vulnerability site.** [src/main/index.ts:73-76](../src/main/index.ts#L73-L76):

```ts
protocol.handle('klip-media', (request) => {
  const filePath = decodeURIComponent(request.url.replace('klip-media://', ''))
  return net.fetch(pathToFileURL(filePath).href)
})
```

There is no normalisation, no `realpath` resolution, no `startsWith(rootPath)` containment check.

**Reproduction sketch.**

1. A comment text contains `<img src="klip-media://C:/Windows/System32/drivers/etc/hosts">`.
2. (Even though our renderer text-escapes content, _any_ future template that renders raw HTML — or any direct DOM manipulation — would trigger the load.)
3. More directly: a stored creator.json with `"thumbnailPath": "../../../../etc/passwd"` plus a renderer that builds a `klip-media://` URL from that path will leak the file content into the rendered DOM, accessible via DevTools, screenshot, or future ML/clipboard features.

**Recommended fix.** Containment check inside the handler:

```ts
import { realpathSync } from 'fs'
import { sep } from 'path'

protocol.handle('klip-media', (request) => {
  const decoded = decodeURIComponent(request.url.replace('klip-media://', ''))
  const requested = realpathSync(decoded)
  const root = realpathSync(container.rootPathRef.value)
  if (!requested.startsWith(root + sep) && requested !== root) {
    return new Response(null, { status: 403 })
  }
  return net.fetch(pathToFileURL(requested).href)
})
```

Caveats:

- `realpathSync` resolves symlinks, mitigating symlink-escape.
- The check uses `+ sep` to prevent `<root>-evil/` matching `<root>` as a prefix.
- Returns 403 (not 404) so the handler signals refusal, not "doesn't exist."

**Effort.** S (~10 LoC + one unit test in tests/main/).

**Exit criterion.** After the fix, `klip-media://C:/Windows/System32/...` (or any equivalent traversal) returns 403, while existing `klip-media://<rootPath>/<creator>/...` URLs continue to resolve.

---

## Findings — HIGH

### F2 — Renderer sandbox disabled + `contextIsolation` not explicit — HIGH

**Threat scenario.** Compounds F1's exfiltration impact. If F1 escalates to script execution (e.g., a future renderer addition uses `dangerouslySetInnerHTML` to render rich-text comments, or a dependency ships an XSS gadget), the _cost_ of that XSS is determined by sandbox + contextIsolation. With `sandbox: false`, the renderer process has access to Node.js APIs through preload's process. With `contextIsolation` left at the (correct, but unstated) default, a future change to that default would silently break preload's bridge.

**Vulnerability site.** [src/main/index.ts:34-37](../src/main/index.ts#L34-L37):

```ts
webPreferences: {
  preload: join(__dirname, '../preload/index.js'),
  sandbox: false
}
```

- `sandbox: false` is **explicit**. This was likely set because preload uses a feature that requires the unsandboxed environment (the toolkit's `electronAPI` import), but the trade is that the renderer has Node.js process access.
- `contextIsolation` is **not specified**. Electron 41's default is `true`, so the bridge is currently isolated — but this is a fragile dependency on a default. Set it explicitly.
- `nodeIntegration` is also not specified (default `false`, which is correct).

The preload's fallback at [src/preload/index.ts:115-119](../src/preload/index.ts#L115-L119) directly assigns `window.api` if `process.contextIsolated` is false — meaning if isolation is ever disabled, API surface bypasses the bridge entirely.

**Reproduction sketch.** A future XSS via stored content + sandbox-disabled renderer = direct `require('child_process').exec('rm -rf ~')`. Currently mitigated by F1 + CSP, but defense-in-depth fails if either of those gives.

**Recommended fix.** Two edits:

1. Set both flags explicitly in `webPreferences`:

   ```ts
   webPreferences: {
     preload: join(__dirname, '../preload/index.js'),
     contextIsolation: true,
     sandbox: false  // keep — preload requires unsandboxed environment
   }
   ```

2. Re-evaluate whether `sandbox: false` is still required. The toolkit's `electronAPI` works in sandboxed preloads in current Electron versions. If sandboxing the renderer is feasible, that's a **major hardening win** — it cuts off Node.js access entirely. This is a separate engineering task (M effort, may need to re-test the IPC bridge), so split into F2a (explicit flags — XS) and F2b (sandbox: true if feasible — M).

**Effort.** F2a XS, F2b M (deferred to follow-up if F2a closes the immediate concern).

**Exit criterion.** After F2a, both `contextIsolation: true` and `sandbox: false` are explicit. After F2b (if pursued), the renderer cannot `require()` Node modules and the IPC bridge still works.

---

### F3 — Production code-signing not configured — HIGH `[needs-product-decision]`

**Threat scenario.** Without code signing, GitHub-released `.exe` / `.dmg` / `.AppImage` artifacts cannot be verified by `electron-updater` at install time. On Windows, SmartScreen blocks first-launch with "Unrecognised app" dialog; on macOS, Gatekeeper blocks unsigned apps from running at all. Auto-updates installed on quit will silently fail signature verification on Windows (good) but the update flow is broken (bad UX). On Linux (AppImage / snap / deb), signing is less standardised — fewer protections by default.

**Vulnerability site.** [electron-builder.yml](../electron-builder.yml):

- Line 28: `notarize: false` (macOS) — explicit.
- No `mac.identity` configured.
- No `win.certificateFile` / `win.certificateSubjectName` configured.
- Linux signing not configured.

**Reproduction sketch.**

- Ship v0.1.0 to GitHub. User downloads installer. Windows shows SmartScreen warning. User clicks through. App runs.
- Ship v0.1.1. `electron-updater` downloads it on quit. On Windows, signature check **fails** (because it's not signed) — the auto-update fails. User stuck on v0.1.0.
- On macOS, Gatekeeper blocks v0.1.0 entirely without notarisation (after macOS 10.15). User can override but most won't.

**This finding has two halves:**

| Half                                                                                                 | Severity in audit terms | Action                                                                                    |
| ---------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| Code path: unsigned auto-updates would be rejected by `electron-updater` (good — accidental defense) | LOW                     | Verified — `electron-updater` rejects unsigned updates by default on Windows. Document.   |
| Product readiness: app cannot ship signed updates without certs + signing pipeline                   | HIGH                    | Linked to F-PD-2. Requires Apple Developer ID + Windows OV/EV cert + CI signing pipeline. |

**Recommended fix.** Linked to **F-PD-2** product decision below. No code-side fix needed until certs are acquired. Once acquired:

- Set `mac.identity`, `mac.notarize: true`, `mac.entitlementsInherit`.
- Set `win.certificateFile` (or hardware-backed signing service) and `win.signtoolOptions`.
- Add signing step to release CI.
- Test the full release → update flow on a fresh Windows + macOS machine.

**Effort.** L (mostly procurement + CI work, not code).

**Exit criterion.** A clean Windows install of release N → install of release N+1 via auto-update completes without SmartScreen warning. A macOS install opens without Gatekeeper override.

---

## Findings — MEDIUM

### F4 — No runtime IPC payload validation — MEDIUM

**Threat scenario.** Per the threat model, a compromised renderer (via F1 or future XSS through stored content) can invoke any `window.api` channel with arbitrary payloads. `IpcContract` provides compile-time type safety only — at runtime, all 30+ handlers receive whatever the renderer passed in. Most use-cases assume well-typed inputs and could:

- Crash the main process (DoS — annoyance more than threat under our model).
- Mutate database rows in unexpected ways (e.g., a malformed `PaginationParams` with `pageSize: 1e9` triggers OOM on `findPaginated`).
- Pass a path-like string to a use-case that joins it onto the root, bypassing `slugify` (rare — most paths come from `listDirectories`, but a future handler that accepts a `filePath` argument could be vulnerable).

**Vulnerability site.** [src/main/interface-adapters/controllers/create-typed-handler.ts:11-19](../src/main/interface-adapters/controllers/create-typed-handler.ts#L11-L19):

```ts
export function createTypedHandler<C extends InvokeChannel>(
  channel: C,
  handler: (event, ...args: IpcContract[C]['params']) => ...
): void {
  ipcMain.handle(channel, handler)
}
```

Zero runtime guards. Each of the 9 controllers passes IPC args directly into use-cases or repositories (e.g., [VideoController.ts:34-36](../src/main/interface-adapters/controllers/VideoController.ts#L34-L36)).

**Recommended fix.** Add `zod` (already a dependency — `package.json:69`). Define one schema per IPC channel in `src/shared/ipc-schemas.ts`. Wrap `createTypedHandler` to parse before invoking:

```ts
export function createTypedHandler<C extends InvokeChannel>(
  channel: C,
  schema: z.ZodTuple<...>,  // tuple matching IpcContract[C]['params']
  handler: (event, ...args) => ...
): void {
  ipcMain.handle(channel, async (event, ...rawArgs) => {
    const parsed = schema.safeParse(rawArgs)
    if (!parsed.success) {
      console.error(`[klip] IPC validation failed for ${channel}:`, parsed.error.format())
      throw new Error(`Invalid payload for ${channel}`)
    }
    return handler(event, ...parsed.data)
  })
}
```

Or — if migrating all 30+ channels at once is too large — start with the 5 that take strings as path-segments (`download-video`, `migrate-root`, `set-setting`, `fetch-video-info`, `probe-media-file`) and progressively cover the rest.

**Effort.** M (~50 LoC for the wrapper + ~10 LoC per schema × 30 channels = ~350 LoC total). Can land incrementally.

**Exit criterion.** Every `createTypedHandler` call also passes a zod schema; any IPC call with a malformed payload throws a typed error rather than crashing the use-case.

---

### F5 — Logging hygiene — paths in stdout/stderr — MEDIUM

**Threat scenario.** 27 `console.log/error/warn` sites in `src/main/` print absolute file paths (dbPath, rootPath, filePaths, downloaded videoIds, error objects that include URLs and stack traces with paths). These go to stdout/stderr, visible to:

- Any process with `stdout`/`stderr` access on the user's session.
- Log files if Electron's stdio is redirected (e.g., bundled installer logs, system journals on Linux).
- Any future telemetry / crash-reporting integration would inherit them.

Under the threat model, this is information disclosure — not a remote breach, but if the user shares logs for debugging, the disclosure scope widens.

**Vulnerability sites.** Sample:

- [src/main/index.ts:88](../src/main/index.ts#L88): `console.log(\`[klip] Container initialised (db: ${dbPath}, root: ${rootPath})\`)`
- [src/main/use-cases/DownloadVideo.ts:179](../src/main/use-cases/DownloadVideo.ts#L179): `console.error(\`[klip] Download failed (${downloadId}):\`, error)` — error may include URL.
- [src/main/use-cases/EnrichMediaMetadata.ts:42](../src/main/use-cases/EnrichMediaMetadata.ts#L42): logs file paths in error context.
- [src/main/framework-drivers/file-system/ChokidarWatcher.ts:148](../src/main/framework-drivers/file-system/ChokidarWatcher.ts#L148): logs rootPath.

Full enumeration: 27 sites identified by Phase 1 exploration; 14 status messages, 4 progress events, 9 error messages.

**Recommended fix.** Linked to **F-PD-3** (redaction policy). Add a small helper:

```ts
// src/main/framework-drivers/logging/redact.ts
export function redactPath(p: string, root?: string): string {
  if (!root) return p.replace(/^.*?(\/|\\)([^/\\]+(\/|\\)){0,2}/, '<redacted>$2')
  return p.startsWith(root) ? '<root>' + p.slice(root.length) : '<external>'
}

export function redactError(err: unknown, root?: string): { message: string; stack?: string } {
  const e = err instanceof Error ? err : new Error(String(err))
  return {
    message: redactPath(e.message, root),
    stack: e.stack ? redactPath(e.stack, root) : undefined
  }
}
```

Then sweep the 27 sites: replace `console.error(msg, err)` with `console.error(msg, redactError(err, rootPath))` and `console.log(\`... ${path}\`)`with`console.log(\`... ${redactPath(path, rootPath)}\`)`.

**Effort.** M (helper ~30 LoC + 27 sites × 1-line change). Cleanest done in one sweep.

**Exit criterion.** No console statement in `src/main/` prints an absolute path or an unredacted error stack. A grep for `\${.*[Pp]ath}` and `console.error.*err` returns only redacted forms.

---

### F6 — `JSON.parse` without runtime schema — MEDIUM

**Threat scenario.** Three classes of `JSON.parse` exist in `src/main/`:

1. **yt-dlp stdout** — 5 sites in [YtDlpDownloader.ts](../src/main/framework-drivers/yt-dlp/YtDlpDownloader.ts). Trusted under our threat model (yt-dlp binary is HTTPS-pinned).
2. **DB tag columns** — 2 sites in `Sqlite{Video,Cut}Repository`. Type-guarded (`Array.isArray + filter typeof === 'string'`). Safe.
3. **Operations payloads** — [RecoverOperations.ts:76, :109](../src/main/use-cases/RecoverOperations.ts#L76). Type-asserted (`as { oldPath?: string; newPath?: string }`) without runtime guards. **A tampered DB row can crash recovery.**

The threat scenario for #3: a corrupted operation row (manual SQL edit, or a future bug that writes malformed payloads) causes `RecoverOperations.execute()` to throw at startup, blocking the app's recovery flow. Since recovery runs on every app start ([src/main/index.ts:115](../src/main/index.ts#L115)), this is a permanent bricking until the user manually deletes the row.

**Vulnerability site.** [src/main/use-cases/RecoverOperations.ts:76-78](../src/main/use-cases/RecoverOperations.ts#L76):

```ts
const payload = JSON.parse(op.payload) as { oldPath?: string; newPath?: string }
const { oldPath, newPath } = payload
```

**Recommended fix.** Use zod schemas for operation payloads. Define them once per `OperationType`:

```ts
const RenameFolderPayload = z.object({ oldPath: z.string(), newPath: z.string() })
const MigrateRootPayload = z.object({
  oldRoot: z.string(),
  newRoot: z.string(),
  folders: z.array(z.string()),
  movedSoFar: z.array(z.string())
})
// ...

const result = RenameFolderPayload.safeParse(JSON.parse(op.payload))
if (!result.success) {
  /* mark rolled_back with parse-error message — already done */
}
```

The existing tests at [tests/main/use-cases/RecoverOperations.test.ts:174](../tests/main/use-cases/RecoverOperations.test.ts#L174) (`should mark rename_folder as rolled_back when payload is malformed JSON`) confirm the pattern is already to roll back on parse failure — formalising with zod tightens the runtime check.

**Effort.** S (~30 LoC for 3 payload schemas).

**Exit criterion.** A tampered `operations.payload` row never crashes startup; it gets rolled back with a clear error message.

---

### F7 — yt-dlp output-template `videoId` interpolation — MEDIUM

**Threat scenario.** The `download()` call interpolates `videoId` directly into the `-o` template:

```ts
'-o',
`${outputDir}/${videoId}.%(ext)s`,
```

If `videoId` contains `..`, `path.join` upstream collapses it before reaching this point — but the template here uses string interpolation, not `path.join`. So if `videoId === '../../../etc/passwd'`, the resulting argument is `<outputDir>/../../../etc/passwd.%(ext)s`. yt-dlp will write the downloaded file outside the intended directory.

**Provenance traced.** [DownloadVideo.ts:86-87](../src/main/use-cases/DownloadVideo.ts#L86-L87):

```ts
const info = await this.fetchInfo.execute(url)
const videoId = info.videoId // from yt-dlp's --dump-json
```

Under our threat model, the yt-dlp binary is trusted. So `videoId` is what yt-dlp says it is — typically an 11-char alphanumeric YouTube ID. **But:**

- yt-dlp supports many platforms beyond YouTube; some have IDs that aren't 11-char alphanumeric.
- A future yt-dlp version could change the ID format.
- The `videoId` is also used as the DB primary key ([DownloadVideo.ts:132](../src/main/use-cases/DownloadVideo.ts#L132)) — a malformed ID could cause downstream invariant breaks.

**Vulnerability site.** [src/main/framework-drivers/yt-dlp/YtDlpDownloader.ts:370](../src/main/framework-drivers/yt-dlp/YtDlpDownloader.ts#L370):

```ts
'-o',
`${outputDir}/${videoId}.%(ext)s`,
```

Plus the path-join in [DownloadVideo.ts:96-101](../src/main/use-cases/DownloadVideo.ts#L96-L101):

```ts
const outputDir = this.pathResolver.join(
  this.rootPath.value,
  folderName,
  'downloads',
  videoId // ← if videoId is '../../', this escapes
)
```

**Recommended fix.** Validate `videoId` against a strict allowlist regex right after `fetchInfo`:

```ts
// In DownloadVideo.ts after line 87:
if (!/^[A-Za-z0-9_-]{1,32}$/.test(videoId)) {
  throw new Error(`Invalid videoId from yt-dlp: ${videoId}`)
}
```

Allowlist matches YouTube + most ID formats yt-dlp produces. Reject anything with `.` `/` `\` or slashes.

**Effort.** S (one line + one test).

**Exit criterion.** A test feeds a `fetchInfo` mock that returns `videoId: '../escape'` and asserts the use-case throws before reaching `pathResolver.join`.

---

## Findings — LOW

### F8 — Bundled binary checksum verification missing — LOW

**Threat scenario.** [scripts/download-binaries.ts](../scripts/download-binaries.ts) downloads `yt-dlp` and `ffprobe` over HTTPS from GitHub releases. No SHA256 verification before extraction. Under our threat model, HTTPS is trusted, so this is defense-in-depth — but:

- A compromised GitHub release artifact (e.g., maintainer account takeover) would slip through.
- The script runs at `npm run setup` / `postinstall` — if the user clones and runs this on a CI machine, a single bad release is a small blast radius vs. the user's machine.

**Sites.** [scripts/download-binaries.ts:22-23](../scripts/download-binaries.ts#L22-L23) for version pins; [:36-94](../scripts/download-binaries.ts#L36-L94) for URL construction; [:112-138](../scripts/download-binaries.ts#L112-L138) for the download path with no integrity check.

**Recommended fix.** Hardcode SHA256 hashes for each platform×version, verify after download:

```ts
const SHASUMS = {
  'yt-dlp.exe': 'abc123...',
  'yt-dlp_macos': 'def456...',
  'yt-dlp_linux': 'ghi789...',
  'ffprobe-6.1-win-64.zip': '...'
  // etc.
}

// after downloadRaw():
const actual = createHash('sha256').update(readFileSync(dest)).digest('hex')
if (actual !== SHASUMS[spec.outputName]) {
  unlinkSync(dest)
  throw new Error(
    `Checksum mismatch for ${spec.name}: expected ${SHASUMS[spec.outputName]}, got ${actual}`
  )
}
```

Hash bumping becomes part of the version-bump workflow.

**Effort.** S (~30 LoC + one-time hash collection).

---

### F9 — `download-binaries.ts` uses `execSync` with interpolated paths — LOW

**Threat scenario.** [scripts/download-binaries.ts:147-153](../scripts/download-binaries.ts#L147-L153):

```ts
execSync(
  `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${BIN_DIR}' -Force"`,
  { stdio: 'pipe' }
)
// ...
execSync(`unzip -o "${zipPath}" -d "${BIN_DIR}"`, { stdio: 'pipe' })
```

`zipPath` and `BIN_DIR` are constructed from `__dirname` + hardcoded names. Under our threat model (single-user, trusted operator), the user owns `__dirname`. But on Windows, a username with `'` in it (rare but possible) could break the powershell quoting. And on macOS / Linux, a path with embedded `"` or `$` would inject.

This is **LOW** because:

- The script runs at install/setup, not at runtime.
- The threat model treats the user as trusted.
- The injection requires a user who installs to a path with shell metacharacters.

**Recommended fix.** Use `execFileSync` with array args:

```ts
if (platform === 'win32') {
  execFileSync(
    'powershell',
    ['-Command', `Expand-Archive -Path "${zipPath}" -DestinationPath "${BIN_DIR}" -Force`],
    { stdio: 'pipe' }
  )
} else {
  execFileSync('unzip', ['-o', zipPath, '-d', BIN_DIR], { stdio: 'pipe' })
}
```

The macOS/Linux `unzip` form is fully shell-free. The Windows form still has a `-Command` string but the _path_ arguments are no longer in shell scope.

**Effort.** XS.

---

### F10 — CSP missing explicit `object-src 'none'` — LOW

**Threat scenario.** [src/renderer/index.html:7-10](../src/renderer/index.html#L7-L10):

```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: klip-media:"
/>
```

`object-src` falls back to `default-src 'self'`, which already restricts `<object>` / `<embed>` / `<applet>` to same-origin. Explicit `object-src 'none'` is the W3C-recommended hardening — it removes any future risk if `default-src` is loosened.

**Recommended fix.**

```html
content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'
data: klip-media:; object-src 'none'; base-uri 'self'; form-action 'none'"
```

Adds:

- `object-src 'none'` — no plugins.
- `base-uri 'self'` — prevents `<base>` injection.
- `form-action 'none'` — no forms expected.

**Effort.** XS.

---

### F11 — `autoDownload + autoInstallOnAppQuit` without explicit consent — LOW (UX/security tradeoff)

**Threat scenario.** [ElectronAutoUpdater.ts:30-31](../src/main/framework-drivers/electron/ElectronAutoUpdater.ts#L30-L31):

```ts
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true
```

Updates download in the background without user prompt and install on quit. If F3 is resolved (production builds signed), `electron-updater` validates signatures, so the worst case is a _rolled-back_ version — not RCE. Without F3, the unsigned-update flow already fails on Windows (good — accidental defense, see F3).

This is a **product UX call**, not a vuln per se. Some apps prefer "download with consent → install with consent" for transparency.

**Recommendation.** Defer until F-PD-2 (signing) is settled. After signing is live, decide whether silent auto-install matches the desired UX.

---

## Needs product decision

These items require product / business decisions and are surfaced separately from the technical-fix queue.

### F-PD-1 — DB-at-rest encryption (SQLCipher) — recommend **defer**

**Technical state.** SQLite database at `app.getPath('userData')/klip.db` is unencrypted. Contents: URL history, creator names, file paths, comment text snapshots, audit log. No credentials, tokens, or secrets.

**Threat coverage if adopted.** Defends against malware on the user's machine (out of our threat model) and against shared-machine snooping (also out of model). Under our model, encryption is moot.

**Cost.** SQLCipher requires (a) building `better-sqlite3` against `sqlcipher` instead of stock SQLite (NPM `better-sqlite3-multiple-ciphers` is the typical workaround, or custom build), (b) a key derivation step at startup (passphrase or OS-keychain), (c) UX flow for forgotten passphrase / key rotation.

**Benefit.** Low under stated threat model.

**Recommended default.** **Defer.** Revisit if (a) the threat model expands to include malware-on-machine, (b) a multi-user mode is added, or (c) compliance (SOC2 / GDPR-style) becomes a requirement.

### F-PD-2 — Production code-signing (Apple + Windows) — recommend **adopt before public release**

**Technical state.** [electron-builder.yml](../electron-builder.yml) configures GitHub releases as the publish provider but no signing identity. `mac.notarize: false` is explicit. Windows certificate not configured.

**Cost.** Apple Developer ID ($99/yr) + Windows code-signing certificate (OV ~$200/yr or hardware-backed EV ~$300/yr) + CI signing pipeline (~1 day of engineering). Annual recurring.

**Benefit.** Required for any public release — without signing, Windows SmartScreen blocks first-launch and macOS Gatekeeper blocks unsigned builds entirely (post macOS 10.15). Auto-update flow on Windows breaks (F3).

**Recommended default.** **Adopt before public release.** Until then, accept that distribution is dev-builds-only / source-installs-only.

### F-PD-3 — Log/telemetry redaction policy — recommend **adopt now**

**Technical state.** F5's logging gap is cheap to close once we agree what counts as "sensitive." Currently nothing leaves the machine, but if file logging or telemetry ever ships, the redaction surface is large (27 sites × paths + URLs in errors).

**Cost.** ~M effort to land redaction helpers (F5) + ongoing convention to apply them.

**Benefit.** Future-proofs every logging site against the day a telemetry tool is added.

**Recommended default.** **Adopt now.** Treat F5 as the first deployment of the policy.

---

## Verified clean (audit log)

The following surfaces were checked and came back clean. Future audits should start from this baseline; any drift represents a regression.

- ✅ **CSP** ([src/renderer/index.html:7-10](../src/renderer/index.html#L7-L10)) — `default-src 'self'`, `script-src 'self'`, no `'unsafe-eval'`, `'unsafe-inline'` for styles only (Tailwind requires it). Minor object-src nit handled in F10.
- ✅ **SQL injection** — all repositories use Drizzle's parameterized `sql\`\``template. LIKE patterns escaped via [escape-like.ts](../src/main/interface-adapters/repositories/escape-like.ts).`findByTags`parameterizes each tag via`sql.join`. No raw string interpolation found.
- ✅ **Preload bridge** ([src/preload/index.ts](../src/preload/index.ts)) — exposes only `window.api` (typed IPC invokers) and `window.electron` (toolkit defaults — limited surface). `process`, `require`, `node` globals not leaked.
- ✅ **`window.api` typing discipline** — no `(window as any).api`, `as any`, or `as unknown as` bypasses found in `src/renderer/` (excluding auto-gen `routeTree.gen.ts`).
- ✅ **Path traversal in FS layer** — folder names always come from `fsReader.listDirectories()` (filesystem-listed, not raw user input). [MigrateRootFolder.ts:120-121](../src/main/use-cases/MigrateRootFolder.ts#L120-L121) validates both roots exist before iteration.
- ✅ **External link handling** ([src/main/index.ts:44-47](../src/main/index.ts#L44-L47)) — `webContents.setWindowOpenHandler` denies all `window.open` and routes via `shell.openExternal`. No user-controlled URL paths into `shell.openExternal`.
- ✅ **slugify** ([src/main/domain/types/slugify.ts](../src/main/domain/types/slugify.ts)) — comprehensive sanitization (NFD, lowercase, alphanumeric+hyphen). Applied before path construction in [DownloadVideo.ts:90](../src/main/use-cases/DownloadVideo.ts#L90) and [FetchChannelInfo.ts:34](../src/main/use-cases/FetchChannelInfo.ts#L34).
- ✅ **Renderer dynamic content** — no `dangerouslySetInnerHTML`, `eval(`, `new Function(`, `<iframe`, `srcdoc` in `src/renderer/`. Comment text, video descriptions, transcripts all rendered through React text nodes (auto-escaped). Confirmed at [videos.$videoId.tsx:175, :206](../src/renderer/src/routes/videos.$videoId.tsx#L175) and [CommentsTab.tsx](../src/renderer/components/features/videos/CommentsTab.tsx).
- ✅ **ffprobe spawn** ([FfprobeMediaProbe.ts:46-56](../src/main/framework-drivers/ffprobe/FfprobeMediaProbe.ts#L46-L56)) — array-based args, default `shell: false`. `filePath` provenance traced through use-cases — comes from DB only (populated by internal code via `listDirectories`).
- ✅ **yt-dlp argument injection for URLs** — all URLs passed as separate array elements; `shell: false`. The `videoId` interpolation in the `-o` template is the one residual surface (F7).
- ✅ **`dev-app-update.yml` excluded from production builds** — explicit in [electron-builder.yml:9](../electron-builder.yml#L9): `'!{...,dev-app-update.yml,...}'`. The `provider: generic` URL pointing at `example.com` is dev-only and never ships.
- ✅ **`target="_blank" rel="noopener"` discipline** — no `target="_blank"` attributes found in renderer, so the rel-noopener concern doesn't apply.

---

## Fix sequencing

Recommended order (CRITICAL → LOW), with effort estimates.

| #   | Finding                                                 | Effort | Reason / dependency                                                             |
| --- | ------------------------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| 1   | **F1** — `klip-media://` containment                    | S      | CRITICAL. No dependency. Land first.                                            |
| 2   | **F2a** — explicit `contextIsolation: true`             | XS     | HIGH. Independent of F2b. Cheap.                                                |
| 3   | **F7** — videoId allowlist                              | S      | MEDIUM. Independent. Cheap.                                                     |
| 4   | **F6** — zod schemas for operation payloads             | S      | MEDIUM. Localised to RecoverOperations + 3 payload types.                       |
| 5   | **F4** — IPC payload zod validation                     | M      | MEDIUM. Largest mechanical sweep. Can land progressively.                       |
| 6   | **F5** + **F-PD-3** — logging redaction helpers + sweep | M      | MEDIUM. Lands the redaction policy at the same time.                            |
| 7   | **F10** — explicit `object-src 'none'` etc. in CSP      | XS     | LOW. One-line edit.                                                             |
| 8   | **F8** — binary sha256 verification                     | S      | LOW. Setup-script hardening.                                                    |
| 9   | **F9** — `download-binaries.ts` `execFileSync`          | XS     | LOW. Setup-script hardening.                                                    |
| 10  | **F11** — auto-update consent UX                        | defer  | LOW. UX call after F-PD-2 settles.                                              |
| 11  | **F2b** — sandbox: true (if feasible)                   | M      | HIGH defense-in-depth. Re-evaluate after F2a + F1 close the immediate concerns. |
| 12  | **F3 + F-PD-2** — code-signing                          | L      | HIGH product decision. Procurement + CI work. Land before any public release.   |
| 13  | **F-PD-1** — DB-at-rest encryption                      | —      | Defer indefinitely under current threat model.                                  |

**Verification gate after fix phase:**

- `npm run typecheck && npm run lint && npm run test:coverage` (regression gate).
- **Manual smoke test** (codeOverview special-cased Step 6 for this):
  - Launch app via `npm run dev`.
  - Confirm a `<img src="klip-media:///etc/passwd">` request from DevTools console returns 403.
  - Confirm renderer DevTools cannot access `process` or `require` (`typeof process === 'undefined'` in renderer console).
  - Confirm an IPC call with a malformed payload (e.g., `window.api.deleteCreator(123)` — number instead of string) throws a typed error rather than crashing the use-case.
  - Confirm `video.description` containing `<script>alert(1)</script>` renders as escaped text, not as a script tag.
