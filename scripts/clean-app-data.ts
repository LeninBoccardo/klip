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

import { existsSync, rmSync } from 'node:fs'
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
      return join(process.env.USERPROFILE ?? homedir(), 'Documents', APP_NAME)
    case 'darwin':
      return join(homedir(), 'Documents', APP_NAME)
    default:
      // Linux's Documents folder is XDG-configurable but ~/Documents is
      // the conventional fallback Electron uses when xdg-user-dir is
      // missing — match that behaviour.
      return join(homedir(), 'Documents', APP_NAME)
  }
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

function rmIfExists(target: string, label: string): void {
  if (!existsSync(target)) {
    console.log(`  · ${label}: nothing to delete (${target})`)
    return
  }
  try {
    rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
    console.log(`  ✓ ${label}: deleted (${target})`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`  ✗ ${label}: failed — ${message}`)
    throw err
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

  // Library root first — once userData is gone we lose the path. Skip
  // when --keep-root is passed (lets the user nuke the DB without
  // re-downloading every video).
  if (!args.keepRoot) {
    rmIfExists(root.path, 'library root')
  } else {
    console.log('  · library root: skipped (--keep-root)')
  }

  rmIfExists(userData, 'userData')

  console.log('\nDone. Next launch will be a clean install.\n')
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err))
  process.exit(1)
})
