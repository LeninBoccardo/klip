import type { IDebouncer } from '@domain/ports'

/**
 * Debouncer backed by Node.js `setTimeout` / `clearTimeout`.
 * Each `schedule()` call cancels any pending timer and starts fresh.
 */
export class NodeDebouncer implements IDebouncer {
  private timer: ReturnType<typeof setTimeout> | null = null

  schedule(callback: () => void, ms: number): void {
    this.cancel()
    this.timer = setTimeout(callback, ms)
  }

  cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}
