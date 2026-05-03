/**
 * Renderer-side platform detection. Used to render `⌘` on macOS and `Ctrl`
 * elsewhere when displaying `mod+*` keybindings. Lives in the renderer because
 * the help overlay and `<Kbd>` callsites should not need an IPC round-trip
 * just to render a static key glyph.
 */
export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function modifierLabel(): string {
  return isMac() ? '⌘' : 'Ctrl'
}

/**
 * Renders a shortcut spec like `'mod+k'` or `'g h'` as platform-appropriate
 * key tokens, suitable for displaying with `<Kbd>` one token at a time.
 *
 * Examples:
 *   'mod+k'  → ['⌘', 'K']        (mac)
 *   'mod+k'  → ['Ctrl', 'K']     (win/linux)
 *   '?'      → ['?']
 *   'g h'    → ['G', 'H']
 */
export function tokenizeShortcut(spec: string): string[] {
  if (spec.includes('+')) {
    return spec.split('+').map((part) => {
      const lower = part.toLowerCase()
      if (lower === 'mod') return modifierLabel()
      if (lower === 'shift') return 'Shift'
      if (lower === 'alt') return isMac() ? '⌥' : 'Alt'
      return part.length === 1 ? part.toUpperCase() : part
    })
  }
  if (spec.includes(' ')) {
    return spec.split(' ').map((part) => (part.length === 1 ? part.toUpperCase() : part))
  }
  return [spec.length === 1 ? spec.toUpperCase() : spec]
}
