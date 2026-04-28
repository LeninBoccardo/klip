/**
 * Path & error redaction for logs.
 *
 * Goal: keep enough context to debug, drop enough to avoid leaking the user's
 * absolute layout to stdout / log files / future telemetry. Two modes:
 *
 *   - **Root-aware** (preferred): if `root` is provided and the path begins
 *     with it, prefix becomes `<root>` and the relative remainder is preserved
 *     verbatim. Multiple occurrences inside a string are all replaced
 *     (split/join keeps the substitution simple and regex-free).
 *
 *   - **Fallback** (no `root`): keep only the last two segments, prefixed with
 *     `<…>/`. Loses absolute-prefix info but still surfaces "which file under
 *     which immediate folder" for debugging.
 *
 * Designed to be cheap and total — every input produces a string. Never
 * throws; never reads the filesystem.
 */

/** Replace absolute paths in `value` with redacted forms. */
export function redactPath(value: string | null | undefined, root?: string): string {
  if (value == null) return String(value)
  if (root && value.length > 0) {
    // Substring replace — handles repeated occurrences inside one string
    // (e.g. an error message that names the same root twice).
    if (value.includes(root)) {
      return value.split(root).join('<root>')
    }
  }
  // Fallback: tail-keep when the value itself is a single path-like token.
  const segments = value.split(/[/\\]/).filter(Boolean)
  if (segments.length <= 2) return value
  return `<…>/${segments.slice(-2).join('/')}`
}

/**
 * Format an unknown error value for logging with absolute paths redacted.
 *
 * If `root` is known, every occurrence of it (in the message AND in the stack)
 * is replaced with `<root>` — call sites that pass an Error with a stack get
 * a stack-trace where the user's home/install paths are anonymised.
 *
 * Without a `root`, returns the message + stack as-is (the fallback in
 * `redactPath` is single-token; running it across a multi-line stack would
 * either over- or under-redact). The expectation is that any logging site
 * that has a `RootPathRef` available passes it.
 */
export function redactError(err: unknown, root?: string): string {
  if (err instanceof Error) {
    const text = err.stack ?? err.message
    return root && text.includes(root) ? text.split(root).join('<root>') : text
  }
  const text = String(err)
  return root && text.includes(root) ? text.split(root).join('<root>') : text
}
