/**
 * Boot smoke test: spawns `npm run dev`, scans stdout/stderr for the four
 * `[klip] …` ready markers main process logs at startup, and exits cleanly
 * once they are all seen. Fails fast on known-bad patterns (preload errors,
 * unhandled rejections) and times out after TIMEOUT_MS if the markers don't
 * appear.
 *
 * Why this exists: the unit tests (vitest) mock IPC, the database, and the
 * file watcher — they don't exercise the real Electron boot path. The recent
 * `module not found: @electron-toolkit/preload` regression slipped past the
 * full test suite because no test spins up an actual Electron process. This
 * script is the cheapest viable end-to-end gate.
 */

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)

const MARKERS: readonly string[] = [
  '[klip] Container initialised',
  '[klip] IPC controllers registered',
  '[klip] Initial reconciliation complete',
  '[klip] File watcher started'
]

const FAIL_PATTERNS: readonly RegExp[] = [
  /Unable to load preload script/,
  /\[klip\] preload-error/,
  /UnhandledPromiseRejection/i
]

const TIMEOUT_MS = 60_000

const seen = new Set<string>()
let finished = false

// electron-vite's `exports` field doesn't expose ./bin/, so resolve via the
// package.json location and compute the bin path manually.
const electronVitePkg = require.resolve('electron-vite/package.json')
const electronViteBin = resolve(dirname(electronVitePkg), 'bin/electron-vite.js')

// Strip `ELECTRON_RUN_AS_NODE` from the inherited env. If it's set (which can
// happen when a parent shell or earlier `@electron/rebuild` run leaks it),
// Electron launches as a bare Node interpreter — no app object, no UI — and
// `out/main/index.js` crashes immediately on `electron.app.isPackaged`.
// Stripping it forces the standard app-mode launch.
const childEnv = { ...process.env }
delete childEnv.ELECTRON_RUN_AS_NODE

// Invoke electron-vite's bin script directly via Node, bypassing the `npm
// run dev` wrapper. Spawning npm (or its `.cmd` shim on Windows) under
// non-TTY stdio either fails with EINVAL (Node 22+ CVE-2024-27980) or
// leaves electron-vite confused about where the Electron binary is.
// Resolving the bin script and running it under `process.execPath` is
// portable and predictable.
const child = spawn(process.execPath, [electronViteBin, 'dev'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: childEnv
})

const finish = (code: number, reason: string): void => {
  if (finished) return
  finished = true
  console.log(`\n[smoke] ${reason}`)
  child.kill('SIGTERM')
  // Give Electron a beat to clean up. On Windows, SIGTERM doesn't always
  // cascade to child processes — if the symptom appears, swap in `tree-kill`.
  setTimeout(() => process.exit(code), 1500)
}

const onChunk = (buf: Buffer): void => {
  const text = buf.toString()
  process.stdout.write(text)

  for (const re of FAIL_PATTERNS) {
    if (re.test(text)) {
      finish(1, `Smoke fail: matched ${re}`)
      return
    }
  }

  for (const m of MARKERS) {
    if (text.includes(m)) seen.add(m)
  }

  if (seen.size === MARKERS.length) {
    finish(0, 'Smoke pass: all ready markers seen')
  }
}

child.stdout.on('data', onChunk)
child.stderr.on('data', onChunk)

child.on('error', (err) => {
  finish(1, `Smoke fail: spawn error: ${err.message}`)
})

setTimeout(() => {
  const remaining = MARKERS.filter((m) => !seen.has(m))
  finish(2, `Timeout after ${TIMEOUT_MS}ms; missing markers: ${remaining.join(', ') || 'none'}`)
}, TIMEOUT_MS)
