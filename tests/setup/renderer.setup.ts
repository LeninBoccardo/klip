/**
 * Renderer test setup — extends expect with DOM matchers.
 */
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

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

afterEach(() => {
  cleanup()
})
