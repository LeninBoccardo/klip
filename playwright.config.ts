import { defineConfig } from '@playwright/test'

/**
 * E2E config — Electron-driven golden paths under `tests/e2e/`. Single
 * worker, no parallelism: every test launches a real Electron process,
 * which is too heavy to fan out. Hermetic via per-test temp DB + root.
 */
export default defineConfig({
  testDir: './tests/e2e',
  // Spec naming convention is `*.spec.ts` to disambiguate from vitest
  // files which use `.test.ts`.
  testMatch: /.*\.spec\.ts$/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'out/playwright-report', open: 'never' }]],
  use: {
    trace: 'retain-on-failure'
  }
})
