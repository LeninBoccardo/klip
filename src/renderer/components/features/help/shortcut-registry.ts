/**
 * Single source of truth for keyboard shortcuts. The `HelpOverlay` reads from
 * this registry to render the cheatsheet, and individual call sites pass the
 * `keys` field to `useShortcut`. Adding a new shortcut means a single edit
 * here plus a translation key in `shortcuts.json`.
 */
export type ShortcutGroup = 'global' | 'navigation' | 'list' | 'forms' | 'player' | 'editor'

export interface ShortcutEntry {
  id: string
  group: ShortcutGroup
  keys: string
  /** key under the `shortcuts` namespace, e.g. `entries.openPalette` */
  descriptionKey: string
}

export const SHORTCUTS: readonly ShortcutEntry[] = [
  // ── Global ──
  { id: 'palette.open', group: 'global', keys: 'mod+k', descriptionKey: 'entries.openPaletteMod' },
  {
    id: 'palette.openSlash',
    group: 'global',
    keys: '/',
    descriptionKey: 'entries.openPaletteSlash'
  },
  { id: 'help.open', group: 'global', keys: '?', descriptionKey: 'entries.openHelp' },

  // ── Navigation chords (g + key) ──
  { id: 'nav.home', group: 'navigation', keys: 'g h', descriptionKey: 'entries.navHome' },
  { id: 'nav.dashboard', group: 'navigation', keys: 'g b', descriptionKey: 'entries.navDashboard' },
  { id: 'nav.downloads', group: 'navigation', keys: 'g d', descriptionKey: 'entries.navDownloads' },
  { id: 'nav.cuts', group: 'navigation', keys: 'g c', descriptionKey: 'entries.navCuts' },
  { id: 'nav.tags', group: 'navigation', keys: 'g t', descriptionKey: 'entries.navTags' },
  { id: 'nav.activity', group: 'navigation', keys: 'g a', descriptionKey: 'entries.navActivity' },
  { id: 'nav.search', group: 'navigation', keys: 'g s', descriptionKey: 'entries.navSearch' },
  { id: 'nav.back', group: 'navigation', keys: 'escape', descriptionKey: 'entries.navBack' },

  // ── List navigation (active when a grid/table has keyboard focus) ──
  { id: 'list.next', group: 'list', keys: 'j', descriptionKey: 'entries.listNext' },
  { id: 'list.prev', group: 'list', keys: 'k', descriptionKey: 'entries.listPrev' },
  { id: 'list.open', group: 'list', keys: 'enter', descriptionKey: 'entries.listOpen' },
  { id: 'list.delete', group: 'list', keys: 'd', descriptionKey: 'entries.listDelete' },

  // ── Forms (in dialogs and multi-line inputs) ──
  { id: 'forms.submit', group: 'forms', keys: 'mod+enter', descriptionKey: 'entries.formsSubmit' },

  // ── Player (active when persistent player is in detail mode) ──
  { id: 'player.playPause', group: 'player', keys: ' ', descriptionKey: 'entries.playerPlayPause' },
  { id: 'player.pauseK', group: 'player', keys: 'k', descriptionKey: 'entries.playerPauseK' },
  {
    id: 'player.seekBack10',
    group: 'player',
    keys: 'j',
    descriptionKey: 'entries.playerSeekBack10'
  },
  {
    id: 'player.seekForward10',
    group: 'player',
    keys: 'l',
    descriptionKey: 'entries.playerSeekForward10'
  },
  {
    id: 'player.seekBack5',
    group: 'player',
    keys: 'arrowleft',
    descriptionKey: 'entries.playerSeekBack5'
  },
  {
    id: 'player.seekForward5',
    group: 'player',
    keys: 'arrowright',
    descriptionKey: 'entries.playerSeekForward5'
  },
  {
    id: 'player.volumeUp',
    group: 'player',
    keys: 'arrowup',
    descriptionKey: 'entries.playerVolumeUp'
  },
  {
    id: 'player.volumeDown',
    group: 'player',
    keys: 'arrowdown',
    descriptionKey: 'entries.playerVolumeDown'
  },
  { id: 'player.mute', group: 'player', keys: 'm', descriptionKey: 'entries.playerMute' },
  {
    id: 'player.fullscreen',
    group: 'player',
    keys: 'f',
    descriptionKey: 'entries.playerFullscreen'
  },
  {
    id: 'player.jumpPercent',
    group: 'player',
    keys: '0…9',
    descriptionKey: 'entries.playerJumpPercent'
  },

  // ── Editor (active inside the dedicated editor window) ──
  // The editor window is a separate Electron window with its own React
  // tree; these shortcuts are wired via `useShortcut` inside `EditorView`,
  // not from the main app's GlobalShortcuts. Listing them here lets the
  // main window's help cheatsheet announce what's available before the
  // user opens the editor.
  { id: 'editor.markIn', group: 'editor', keys: 'i', descriptionKey: 'entries.editorMarkIn' },
  { id: 'editor.markOut', group: 'editor', keys: 'o', descriptionKey: 'entries.editorMarkOut' },
  {
    id: 'editor.frameStepBack',
    group: 'editor',
    keys: ',',
    descriptionKey: 'entries.editorFrameStepBack'
  },
  {
    id: 'editor.frameStepForward',
    group: 'editor',
    keys: '.',
    descriptionKey: 'entries.editorFrameStepForward'
  },
  {
    id: 'editor.seekBack1',
    group: 'editor',
    keys: 'arrowleft',
    descriptionKey: 'entries.editorSeekBack1'
  },
  {
    id: 'editor.seekForward1',
    group: 'editor',
    keys: 'arrowright',
    descriptionKey: 'entries.editorSeekForward1'
  },
  {
    id: 'editor.seekBack5',
    group: 'editor',
    keys: 'shift+arrowleft',
    descriptionKey: 'entries.editorSeekBack5'
  },
  {
    id: 'editor.seekForward5',
    group: 'editor',
    keys: 'shift+arrowright',
    descriptionKey: 'entries.editorSeekForward5'
  },
  {
    id: 'editor.save',
    group: 'editor',
    keys: 'mod+enter',
    descriptionKey: 'entries.editorSave'
  },
  { id: 'editor.close', group: 'editor', keys: 'escape', descriptionKey: 'entries.editorClose' }
] as const

export const GROUPS: readonly ShortcutGroup[] = [
  'global',
  'navigation',
  'list',
  'forms',
  'player',
  'editor'
] as const

export function shortcutsByGroup(group: ShortcutGroup): ShortcutEntry[] {
  return SHORTCUTS.filter((s) => s.group === group)
}
