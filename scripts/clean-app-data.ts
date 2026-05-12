/**
 * Factory-reset helper for klip.
 *
 * Wipes everything that would otherwise persist across a fresh install:
 *   - the user's library root (videos, cuts, sidecars, thumbnails, the
 *     `.klip-render` staging dir, the `.klip-cache` scrub cache);
 *   - the entire Electron `userData` directory (`klip.db` + WAL/SHM,
 *     window state, electron-store settings, etc.).
 *
 * Root-path resolution, in priority order:
 *   1. `--root <path>` flag (explicit user override)
 *   2. `rootPath` setting in `klip.db` (if readable)
 *   3. `KLIP_DEFAULT_ROOT` env var (matches src/main/index.ts)
 *   4. `~/Documents/klip` (matches the in-app default)
 *
 * The DB read uses `better-sqlite3` and may fail with an ABI mismatch
 * if the native binding was last built for Electron's Node version
 * (which `npm run dev` does). In that case we fall back gracefully to
 * the default — no rebuild required, which avoids the file-locked
 * `EBUSY` failure that hits when an Electron process is still running.
 *
 * Usage:
 *   npm run clean                       # interactive — prompts to confirm
 *   npm run clean -- --yes              # CI / scripted — skips the prompt
 *   npm run clean -- --keep-root        # only nukes userData, leaves library
 *   npm run clean -- --root /my/path    # explicit root override
 *
 * The script is intentionally NOT in `pretest` / `dev`; the user
 * triggers it explicitly when they want a fresh slate.
 */

import { execSync } from 'node:child_process'
import { existsSync, rmSync, openSync, closeSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const APP_NAME = 'klip'

interface Args {
  yes: boolean
  keepRoot: boolean
  rootOverride: string | null
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const rootIdx = argv.findIndex((a) => a === '--root')
  return {
    yes: argv.includes('--yes') || argv.includes('-y'),
    keepRoot: argv.includes('--keep-root'),
    rootOverride: rootIdx >= 0 ? (argv[rootIdx + 1] ?? null) : null
  }
}

/** Mirror of Electron's `app.getPath('userData')` resolution. */
function resolveUserDataDir(): string {
  switch (platform()) {
    case 'win32': {
      const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
      return join(appData, APP_NAME)
    }
    case 'darwin':
      return join(homedir(), 'Library', 'Application Support', APP_NAME)
    default: {
      const xdg = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
      return join(xdg, APP_NAME)
    }
  }
}

/** Mirror of `defaultRootPath` from src/main/index.ts. */
function resolveDefaultRoot(): string {
  if (process.env.KLIP_DEFAULT_ROOT) return process.env.KLIP_DEFAULT_ROOT
  // Electron's app.getPath('documents') is platform-specific; we hand-
  // resolve here because we don't have an Electron app instance.
  switch (platform()) {
    case 'win32':
      return join(resolveWindowsDocumentsDir(), APP_NAME)
    case 'darwin':
      return join(homedir(), 'Documents', APP_NAME)
    default:
      // Linux's Documents folder is XDG-configurable but ~/Documents is
      // the conventional fallback Electron uses when xdg-user-dir is
      // missing — match that behaviour.
      return join(homedir(), 'Documents', APP_NAME)
  }
}

/**
 * Resolve the real Windows "Documents" folder, respecting OneDrive
 * redirection and corporate Group-Policy folder redirects.
 *
 * Why this exists: Electron's `app.getPath('documents')` calls into
 * the Win32 shell (SHGetKnownFolderPath) which honours redirection, so
 * klip stores the redirected path (e.g. `<user>\OneDrive\Documents\klip`)
 * in its settings. This script runs under plain Node, so we have to
 * resolve the redirected path ourselves — otherwise the library wipe
 * targets a folder that doesn't exist while the real one survives.
 *
 * Resolution order:
 *   1. Registry — `HKCU\…\User Shell Folders\Personal` is the
 *      authoritative redirection target. Set by OneDrive, by GPO, and
 *      by user-driven "Move…" actions on the Documents folder.
 *   2. `%OneDrive%\Documents` if present on disk — fast and reliable
 *      when OneDrive is the redirect source.
 *   3. `%USERPROFILE%\Documents` — last-resort default for clean
 *      installs with no redirection at all.
 */
function resolveWindowsDocumentsDir(): string {
  try {
    const out = execSync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders" /v Personal',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    )
    // Line shape:
    //     Personal    REG_EXPAND_SZ    %USERPROFILE%\OneDrive\Documents
    const match = /Personal\s+REG_[A-Z_]+\s+(.+?)\s*$/m.exec(out)
    if (match) {
      const expanded = match[1]
        .trim()
        .replace(/%([^%]+)%/g, (_, name) => process.env[name] ?? '')
      if (expanded && existsSync(expanded)) return expanded
    }
  } catch {
    // `reg query` may fail under restricted shells or non-Windows hosts
    // running this code; fall through to env-var detection.
  }
  if (process.env.OneDrive) {
    const oneDriveDocs = join(process.env.OneDrive, 'Documents')
    if (existsSync(oneDriveDocs)) return oneDriveDocs
  }
  return join(process.env.USERPROFILE ?? homedir(), 'Documents')
}

interface RootResolution {
  path: string
  source: 'flag' | 'db' | 'env-default' | 'fallback'
  warning?: string
}

/**
 * Read the configured library root. Falls back through the priority
 * chain documented at the top of the file. Never throws — every
 * failure path produces a usable resolution with an explanatory
 * warning.
 */
async function resolveRootPath(override: string | null, dbPath: string): Promise<RootResolution> {
  if (override) {
    return { path: override, source: 'flag' }
  }
  if (existsSync(dbPath)) {
    try {
      const dbRoot = await readRootPathFromDb(dbPath)
      if (dbRoot) return { path: dbRoot, source: 'db' }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const fallback = resolveDefaultRoot()
      return {
        path: fallback,
        source: 'fallback',
        warning: `Could not read rootPath from DB (${summariseError(message)}). Falling back to default; pass --root <path> if your library lives elsewhere.`
      }
    }
  }
  return {
    path: resolveDefaultRoot(),
    source: process.env.KLIP_DEFAULT_ROOT ? 'env-default' : 'fallback'
  }
}

function summariseError(message: string): string {
  if (/NODE_MODULE_VERSION/i.test(message)) return 'native binding ABI mismatch'
  if (/locked|busy/i.test(message)) return 'database is locked (klip still running?)'
  return message.split('\n')[0]
}

/**
 * Lazy `import` of better-sqlite3 so a missing/mismatched native
 * binding only affects the DB-read path, not the rest of the script.
 */
async function readRootPathFromDb(dbPath: string): Promise<string | null> {
  const { default: BetterSqlite3 } = await import('better-sqlite3')
  const db = new BetterSqlite3(dbPath, { readonly: true, fileMustExist: true })
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('rootPath') as
      | { value: string }
      | undefined
    return row?.value ?? null
  } finally {
    db.close()
  }
}

async function confirm(prompt: string): Promise<boolean> {
  const rl = createInterface({ input, output })
  try {
    const answer = (await rl.question(prompt)).trim().toLowerCase()
    return answer === 'yes' || answer === 'y'
  } finally {
    rl.close()
  }
}

/**
 * Returns true on success (or when nothing was there to delete). Catches
 * its own errors and prints a hint instead of throwing — see `main` for
 * why a failure here must not abort the rest of the script.
 *
 * Retries are tuned for Windows: file handles linger briefly after an
 * Electron process exits, and SQLite WAL/SHM unmaps can take a moment
 * even after `db.close()` returns. Five attempts × 300ms covers the
 * realistic worst case without making the happy path noticeably slower.
 */
function rmIfExists(target: string, label: string): boolean {
  if (!existsSync(target)) {
    console.log(`  · ${label}: nothing to delete (${target})`)
    return true
  }
  try {
    rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
    console.log(`  ✓ ${label}: deleted (${target})`)
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`  ✗ ${label}: failed — ${message}`)
    if (/EBUSY|EPERM|EACCES|ENOTEMPTY/i.test(message)) {
      console.error(
        `    Hint: close klip (and any program holding files under ${target}) and retry.`
      )
    }
    return false
  }
}

async function main(): Promise<void> {
  const args = parseArgs()
  const userData = resolveUserDataDir()
  const dbPath = join(userData, 'klip.db')

  const root = await resolveRootPath(args.rootOverride, dbPath)

  console.log('\nklip — factory reset')
  console.log('────────────────────')
  if (root.warning) console.log(`! ${root.warning}\n`)
  console.log('Will delete:')
  if (!args.keepRoot) {
    console.log(`  • library root:  ${root.path}  [source: ${root.source}]`)
  }
  console.log(`  • userData dir:  ${userData}`)
  console.log('')
  console.log('This is IRREVERSIBLE. Downloaded videos, cuts, settings,')
  console.log('preferences, window state, and the SQLite database will be gone.')
  console.log('')

  if (!args.yes) {
    const ok = await confirm('Type "yes (y)" to proceed: ')
    if (!ok) {
      console.log('Aborted.')
      return
    }
  }

  console.log('')

  // Pre-flight: if klip.db can't be opened for writing, klip is almost
  // certainly still running and the rmSync below will fail. Surface this
  // upfront with a clear message instead of letting the user puzzle over
  // an EBUSY half-deletion.
  assertDbUnlocked(dbPath)

  // userData first — it contains klip.db, which is the highest-priority
  // target of a "clean DB" reset. If the library deletion below fails
  // (a video player holding a thumbnail open, an OS file-indexer scan,
  // OneDrive sync, etc.), the critical DB wipe has already happened.
  //
  // Reading root.path no longer depends on the DB at this point — it was
  // resolved into memory by resolveRootPath() before any deletion ran.
  //
  // Explicit DB files first within userData: better-sqlite3's readonly
  // open earlier in this script may have left an mmap on klip.db-shm
  // that lingers a beat after process exit on Windows; deleting the DB
  // files individually with their own retry budget makes the eventual
  // recursive rmSync's job easier.
  const dbFilesOk = deleteDbFiles(userData)
  const userDataOk = rmIfExists(userData, 'userData')

  // Verify klip.db is actually gone. Catches any silent rmSync skip
  // (e.g. an exotic permission edge case where force:true masked a fail).
  if (existsSync(dbPath)) {
    console.error(`  ✗ verification: ${dbPath} still exists after deletion!`)
  } else {
    console.log('  ✓ verification: klip.db is gone')
  }

  let libraryOk = true
  if (!args.keepRoot) {
    libraryOk = rmIfExists(root.path, 'library root')
  } else {
    console.log('  · library root: skipped (--keep-root)')
  }

  if (!userDataOk || !libraryOk || !dbFilesOk || existsSync(dbPath)) {
    console.error('\nOne or more targets failed to delete. See messages above.')
    process.exit(1)
  }

  console.log('\nDone. Next launch will be a clean install.\n')
}

/**
 * Try to open klip.db for write+exclusive access; if it fails with a
 * sharing/locking error, klip (or another process) still has it open.
 * We bail with a clear message rather than spinning through retries on
 * deletion attempts that are guaranteed to fail.
 *
 * The file is closed immediately whether the open succeeded or not, so
 * this never leaves a handle behind.
 */
function assertDbUnlocked(dbPath: string): void {
  if (!existsSync(dbPath)) return
  let fd: number | undefined
  try {
    // 'r+' = read-write, file must exist. If something has it locked
    // (klip's WAL handle, an open transaction), this throws EBUSY on
    // Windows or simply succeeds on Linux/macOS where advisory locks
    // don't block opens.
    fd = openSync(dbPath, 'r+')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/EBUSY|EACCES|EPERM/i.test(message)) {
      console.error(
        `\n✗ ${dbPath} is locked — klip (or another process) still has it open.`
      )
      console.error('   Close klip completely and re-run.')
      console.error(`   Underlying error: ${message}\n`)
      process.exit(1)
    }
    // Some other error (ENOENT race, etc.) — fall through to the
    // deletion logic and let it surface the real failure.
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

/**
 * Delete klip.db plus its WAL/SHM sidecars individually with their own
 * retry budget. Runs before the broader `rmSync(userData, …)` so the
 * critical files have the best chance of clearing even if some other
 * file in userData later trips an EBUSY.
 */
function deleteDbFiles(userData: string): boolean {
  const targets = ['klip.db', 'klip.db-wal', 'klip.db-shm', 'klip.db-journal']
  let ok = true
  for (const name of targets) {
    const target = join(userData, name)
    if (!existsSync(target)) continue
    try {
      rmSync(target, { force: true, maxRetries: 10, retryDelay: 200 })
      console.log(`  ✓ db file: deleted (${target})`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`  ✗ db file: failed — ${target} — ${message}`)
      ok = false
    }
  }
  return ok
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err))
  process.exit(1)
})
