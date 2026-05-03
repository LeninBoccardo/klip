import { test as base, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * Per-test fixture that launches the built Electron app pointed at a
 * temp `userData` directory and a temp `rootPath`. The `KLIP_USER_DATA`
 * + `KLIP_DEFAULT_ROOT` env vars are read by the main process before
 * any persistent state is touched.
 *
 * `npm run build` must have been run before invoking the suite — the
 * fixture targets `out/main/index.js`. The top-level `e2e` script
 * chains the build for you.
 *
 * Cleanup: `afterEach` closes the app and removes the temp dir. On
 * Windows, the WAL handles can briefly hold the DB file; the cleanup
 * is best-effort and never fails the test.
 */

interface KlipFixtures {
  electronApp: ElectronApplication
  window: Page
  tmpRoot: string
  tmpUserData: string
}

export const test = base.extend<KlipFixtures>({
  // eslint-disable-next-line no-empty-pattern
  tmpUserData: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'klip-e2e-userdata-'))
    await use(dir)
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // best-effort
    }
  },

  // eslint-disable-next-line no-empty-pattern
  tmpRoot: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'klip-e2e-root-'))
    await use(dir)
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // best-effort
    }
  },

  electronApp: async ({ tmpUserData, tmpRoot }, use) => {
    const mainEntry = resolve(__dirname, '..', '..', '..', 'out', 'main', 'index.js')
    const app = await _electron.launch({
      args: [mainEntry],
      env: {
        ...process.env,
        // Strip ELECTRON_RUN_AS_NODE — see memory:
        // electron_run_as_node_leak.md.
        ELECTRON_RUN_AS_NODE: '',
        KLIP_USER_DATA: tmpUserData,
        KLIP_DEFAULT_ROOT: tmpRoot,
        // Suppress dev-mode network behaviour in case ELECTRON_IS_DEV
        // leaked into the parent shell.
        NODE_ENV: 'production'
      }
    })
    await use(app)
    await app.close()
  },

  window: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await use(window)
  }
})

export { expect } from '@playwright/test'
