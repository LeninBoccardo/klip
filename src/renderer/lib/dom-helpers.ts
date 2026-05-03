/**
 * Returns true when the active focus is in a text-entry surface — used to
 * suppress global single-key shortcuts (`/`, `?`, chord prefixes) so they
 * don't hijack typing. Modifier-prefixed shortcuts like `Cmd+K` intentionally
 * bypass this since they're the standard escape hatch from any input.
 */
export function isTextInputActive(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if ((el as HTMLElement).isContentEditable) return true
  return false
}
