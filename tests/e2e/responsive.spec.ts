import { test, expect } from './fixtures/electron-app'

/**
 * Catches the regression class that prompted Item 28: a body-level scrollbar
 * appearing on pages where content fits in view. The check is cheap — assert
 * `document.body.scrollHeight <= window.innerHeight + 2` (the ±2px slack
 * absorbs sub-pixel rounding) — and runs at two viewport sizes that bracket
 * the supported range. Adding a new route to the matrix is one line.
 *
 * If you ever see this fail, the height chain in `main.css` (sidebar-wrapper)
 * or `__root.tsx` (SidebarInset wrapping) has drifted; that's where to look.
 */
const VIEWPORTS = [
  { name: '1024x720 (minimum)', width: 1024, height: 720 },
  { name: '1280x800 (default)', width: 1280, height: 800 }
] as const

const ROUTES = ['/', '/dashboard', '/cuts', '/tags', '/collections', '/about'] as const

for (const vp of VIEWPORTS) {
  test.describe(`responsive @ ${vp.name}`, () => {
    test('boots without a body-level scrollbar on key routes', async ({
      window: page,
      electronApp
    }) => {
      // The Electron BrowserWindow is created with width: 1280, height: 936,
      // and minWidth: 1024. We can resize down to the minimum within the
      // allowed range without triggering the OS clamp.
      const win = electronApp.windows()[0]
      await win.setViewportSize({ width: vp.width, height: vp.height })

      for (const route of ROUTES) {
        await page.evaluate((r) => {
          window.history.pushState({}, '', r)
          window.dispatchEvent(new PopStateEvent('popstate'))
        }, route)
        // Give the route a tick to settle (skeleton → real content).
        await page.waitForTimeout(150)

        const overflow = await page.evaluate(() => ({
          bodyScroll: document.body.scrollHeight,
          inner: window.innerHeight,
          docScroll: document.documentElement.scrollHeight
        }))

        expect(
          overflow.bodyScroll,
          `body scrolls past viewport on ${route} @ ${vp.width}x${vp.height} (body=${overflow.bodyScroll}, viewport=${overflow.inner})`
        ).toBeLessThanOrEqual(overflow.inner + 2)
      }
    })
  })
}
