import { test, expect } from './fixtures/electron-app'

/**
 * Smoke replacement: launches the built Electron app, asserts the main
 * window renders, the renderer reports its document is reachable, and
 * the IPC bridge (`window.api`) is exposed.
 *
 * This test is deliberately non-functional — it only verifies the boot
 * path. Functional tests live in their own specs and rely on the same
 * fixture for hermetic temp dirs.
 */
test('boots the app and exposes the IPC bridge', async ({ window: page, electronApp }) => {
  // The renderer should reach DOMContentLoaded (the fixture awaits it).
  // From there, the contextBridge-exposed `window.api` must be present —
  // its absence has historically been the canary for preload bundling
  // regressions (see memory: sandboxed_preload_bundling).
  const apiExposed = await page.evaluate(
    () => typeof (window as unknown as { api?: unknown }).api === 'object'
  )
  expect(apiExposed).toBe(true)

  // The app process is running and reachable via the chrome devtools
  // protocol (Playwright's _electron uses CDP under the hood).
  const procInfo = await electronApp.evaluate(({ app }) => ({
    name: app.getName(),
    isReady: app.isReady()
  }))
  expect(procInfo.isReady).toBe(true)
})
