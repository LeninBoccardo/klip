/**
 * Abstraction over a resettable debounce timer.
 * Each call to `schedule` cancels any pending timer and starts a new one.
 */
export interface IDebouncer {
  /** Schedule `callback` to run after `ms` milliseconds. Resets on each call. */
  schedule(callback: () => void, ms: number): void

  /** Cancel the pending timer, if any */
  cancel(): void
}
