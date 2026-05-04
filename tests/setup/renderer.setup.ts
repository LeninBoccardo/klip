/**
 * Renderer test setup — extends expect with DOM matchers.
 */
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Initialize i18next with the EN bundle so `t()` returns real strings during
// tests, matching the pre-i18n English copy that existing assertions check
// against. Without this, components render translation keys like
// "actions.reload" instead of "Reload".
import '@renderer/i18n'

// jsdom does not implement ResizeObserver. Radix UI primitives (ScrollArea,
// Collapsible, Popover) call it during layout effects; without this no-op
// shim, every test that mounts one throws `ResizeObserver is not defined`.
class ResizeObserverShim {
  observe(): void {
    // intentional no-op
  }
  unobserve(): void {
    // intentional no-op
  }
  disconnect(): void {
    // intentional no-op
  }
}
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = ResizeObserverShim as unknown as typeof ResizeObserver
}

// jsdom does not implement Element.prototype.scrollIntoView. cmdk auto-selects
// the first matching item on mount and calls it inside a layout effect — every
// CommandDialog / Combobox / TagInput test would otherwise crash.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function (): void {
    /* no-op for jsdom */
  }
}

afterEach(() => {
  cleanup()
})
